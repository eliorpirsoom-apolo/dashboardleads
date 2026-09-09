import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import {
  markLeadIfDuplicate,
  createLeadNumbered,
  defaultStatusId,
  normalizePhone,
  normalizeEmail,
} from "@/lib/leads";
import { recordActivity } from "@/lib/leadActivity";

export const dynamic = "force-dynamic";

const Body = z.union([
  z.object({
    action: z.literal("dedupe-repeat-activities"),
    leadId: z.string().min(1),
  }),
  z.object({
    action: z.literal("scan-duplicates"),
    clientId: z.string().min(1),
    apply: z.boolean().default(false),
  }),
  // תיקון תאריכים עתידיים מבאג ייבוא dd/mm↔mm/dd: החלפת יום/חודש חזרה
  // כשאפשר, אחרת תאריך היצירה. apply=false ⟵ דו"ח בלבד.
  z.object({
    action: z.literal("fix-future-received"),
    apply: z.boolean().default(false),
  }),
  // שחזור ליד מרישום קליטה שנדחה (למשל: באג מיפוי מפתחות עברית 9.9) —
  // יצירה שקטה (בלי התראות) עם תאריך הקבלה המקורי.
  z.object({
    action: z.literal("recover-rejected-lead"),
    logId: z.string().min(1),
  }),
]);

// POST /api/admin-ops/cleanup — פעולות ניקוי (מנהל בלבד).
// dedupe-repeat-activities: משאיר את רשומת "פנייה חוזרת" הראשונה ומוחק את השאר.
// scan-duplicates: סריקת כל לידי הלקוח (לא שיחות, לא ארכיון) לאיתור כפולים
// לפי טלפון/אימייל; apply=false ⟵ דו"ח בלבד, apply=true ⟵ סימון בפועל.
export const POST = handle(async (req) => {
  await requireManager();
  const b = Body.parse(await readJson(req));

  if (b.action === "dedupe-repeat-activities") {
    const acts = await prisma.leadActivity.findMany({
      where: { leadId: b.leadId, kind: "repeat" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (acts.length <= 1) return NextResponse.json({ deleted: 0, kept: acts.length });
    const res = await prisma.leadActivity.deleteMany({
      where: { id: { in: acts.slice(1).map((a) => a.id) } },
    });
    return NextResponse.json({ deleted: res.count, kept: 1 });
  }

  // --- recover-rejected-lead -------------------------------------------------
  if (b.action === "recover-rejected-lead") {
    const log = await prisma.intakeLog.findUnique({
      where: { id: b.logId },
      include: { source: { select: { name: true, projectId: true, clientId: true } } },
    });
    if (!log || log.status !== "rejected") throw new ApiError(404, "רישום דחייה לא נמצא");
    const clientId = log.clientId ?? log.source?.clientId;
    if (!clientId) throw new ApiError(400, "לרישום אין לקוח");
    let pl: Record<string, any> = {};
    try { pl = JSON.parse(log.payload ?? "{}"); } catch {}
    const norm = (s: string) =>
      s.toLowerCase().trim().replace(/[?!:]+$/, "").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
    const findVal = (aliases: string[]) => {
      for (const [k, v] of Object.entries(pl)) {
        if (aliases.includes(norm(k)) && v != null && typeof v !== "object" && String(v).trim() !== "") {
          return String(v);
        }
      }
      return null;
    };
    const fullName = findVal(["שם מלא", "שם", "full name", "name", "fullname"]);
    const phone = normalizePhone(findVal(["מספר טלפון", "טלפון", "phone number", "phone", "tel"]));
    const email = normalizeEmail(findVal(["אימייל", "מייל", "email", "e mail"]));
    if (!fullName && !phone && !email) throw new ApiError(400, "אין זהות בליד — אין מה לשחזר");
    const existing =
      phone || email
        ? await prisma.lead.findFirst({
            where: {
              clientId,
              archived: false,
              OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
            },
            select: { number: true },
          })
        : null;
    if (existing) return NextResponse.json({ recovered: false, alreadyExists: existing.number });
    const extras: Record<string, any> = {};
    for (const [k, v] of Object.entries(pl)) {
      if (["id", "platform", "channel", "campaign_name", "adset_name", "ad_name"].includes(k)) continue;
      if (v == null || typeof v === "object") continue;
      extras[k.replace(/_/g, " ")] = v;
    }
    const lead = await createLeadNumbered({
      clientId,
      projectId: log.source?.projectId ?? null,
      kind: "form",
      statusId: await defaultStatusId(clientId),
      fullName,
      phone,
      email,
      channel: typeof pl.channel === "string" ? pl.channel : "facebook",
      platform: typeof pl.platform === "string" ? pl.platform : null,
      campaignLabel: typeof pl.campaign_name === "string" ? pl.campaign_name : null,
      audience: typeof pl.adset_name === "string" ? pl.adset_name : null,
      adName: typeof pl.ad_name === "string" ? pl.ad_name : null,
      externalId: typeof pl.id === "string" ? pl.id : null,
      consent: false,
      receivedAt: log.createdAt,
      data: Object.keys(extras).length ? JSON.stringify(extras) : null,
    });
    await recordActivity(lead.id, "מערכת", "import", {
      note: `שוחזר מדחיית קליטה (${log.source?.name ?? "מקור לא ידוע"}) — התקבל במקור ${log.createdAt.toLocaleDateString("he-IL")}`,
    }).catch(() => {});
    return NextResponse.json({ recovered: true, number: lead.number });
  }

  // --- fix-future-received ---------------------------------------------------
  if (b.action === "fix-future-received") {
    const now = new Date();
    const leads = await prisma.lead.findMany({
      where: { receivedAt: { gt: now } },
      select: { id: true, number: true, receivedAt: true, createdAt: true },
    });
    const plan = leads.map((l) => {
      const r = l.receivedAt;
      // הפירסור השגוי שמר חודש=DD וים=MM מהקובץ; מחליפים חזרה כשזה תקף ובעבר.
      const intendedMonth = r.getDate(); // מספר החודש האמיתי מהקובץ
      const intendedDay = r.getMonth() + 1;
      const swapped = new Date(r.getFullYear(), intendedMonth - 1, intendedDay, r.getHours(), r.getMinutes());
      const ok = intendedMonth <= 12 && !isNaN(swapped.getTime()) && swapped <= now;
      return { id: l.id, number: l.number, from: r, to: ok ? swapped : l.createdAt };
    });
    let applied = 0;
    if (b.apply) {
      const { recordActivity } = await import("@/lib/leadActivity");
      for (const p of plan) {
        await prisma.lead.update({ where: { id: p.id }, data: { receivedAt: p.to } });
        await recordActivity(p.id, "מערכת", "import", {
          note: `תאריך הקליטה תוקן אוטומטית (באג פירסור בייבוא): ${p.from.toLocaleDateString("he-IL")} ← ${p.to.toLocaleDateString("he-IL")}`,
        }).catch(() => {});
        applied++;
      }
    }
    return NextResponse.json({
      found: plan.length,
      applied,
      sample: plan.slice(0, 8).map((p) => `#${p.number}: ${p.from.toISOString().slice(0, 10)} ← ${p.to.toISOString().slice(0, 10)}`),
    });
  }

  // --- scan-duplicates -------------------------------------------------------
  const client = await prisma.client.findUnique({ where: { id: b.clientId }, select: { id: true } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");
  const dupStatus = await prisma.leadStatus.findFirst({
    where: { clientId: b.clientId, OR: [{ systemKind: "duplicate" }, { name: "כפול" }] },
    select: { id: true },
  });
  const leads = await prisma.lead.findMany({
    where: { clientId: b.clientId, archived: false, kind: { not: "call" } },
    orderBy: { receivedAt: "asc" },
    select: { id: true, number: true, phone: true, email: true, statusId: true },
  });
  const seenPhone = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  const candidates: { id: string; number: number; of: number }[] = [];
  for (const l of leads) {
    const phoneHit = l.phone ? seenPhone.get(l.phone) : undefined;
    const emailHit = l.email ? seenEmail.get(l.email) : undefined;
    const hit = phoneHit ?? emailHit;
    if (hit !== undefined) {
      if (!dupStatus || l.statusId !== dupStatus.id) {
        candidates.push({ id: l.id, number: l.number, of: hit });
      }
    } else {
      if (l.phone) seenPhone.set(l.phone, l.number);
      if (l.email) seenEmail.set(l.email, l.number);
    }
  }
  let applied = 0;
  if (b.apply) {
    for (const c of candidates) {
      if (await markLeadIfDuplicate(c.id, false).catch(() => false)) applied++;
    }
  }
  return NextResponse.json({
    scanned: leads.length,
    found: candidates.length,
    applied,
    sample: candidates.slice(0, 20).map((c) => `#${c.number} כפול של #${c.of}`),
  });
});
