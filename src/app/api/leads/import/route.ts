import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import {
  createLeadNumbered,
  defaultStatusId,
  findDuplicateLead,
  normalizeEmail,
  normalizePhone,
} from "@/lib/leads";
import { recordActivity } from "@/lib/leadActivity";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// פירסור תאריך ישראלי: 12/07/2026 = 12 ביולי (dd/mm), לא 7 בדצמבר.
// new Date("12/07/2026") של JS מפרש חודש/יום אמריקאי — הבאג שדחף 48 לידים
// מיובאים ל"עתיד" ושבר את סדר החדש-למעלה (תוקן 2026-09-09).
function parseIlDate(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  // ISO (yyyy-mm-dd...) — חד-משמעי, נשאר כמו שהוא.
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(t)) {
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }
  // dd/mm/yyyy · dd.mm.yy · dd-mm-yyyy (+ שעה אופציונלית) — פורמט ישראלי.
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2}))?/.exec(t);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const d = new Date(yy, mm - 1, dd, Number(m[4] ?? 12), Number(m[5] ?? 0));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

// CSV import — agency managers only (approved decision 3: המשרד כשומר סף).
const ImportReq = z.object({
  clientId: z.string().min(1),
  rows: z
    .array(
      z.object({
        fullName: z.string().max(120).optional().nullable(),
        phone: z.string().max(40).optional().nullable(),
        email: z.string().max(160).optional().nullable(),
        city: z.string().max(80).optional().nullable(),
        channel: z.string().max(40).optional().nullable(),
        campaignLabel: z.string().max(160).optional().nullable(),
        consent: z.boolean().optional(),
        receivedAt: z.string().optional().nullable(),
        notes: z.string().max(1000).optional().nullable(),
      })
    )
    .min(1, "אין שורות לייבוא")
    .max(2000, "מקסימום 2000 שורות בייבוא אחד"),
});

// POST /api/leads/import — bulk-create with per-row dedupe + result report.
export const POST = handle(async (req) => {
  const actor = await requireManager();
  const body = ImportReq.parse(await readJson(req));

  const client = await prisma.client.findUnique({ where: { id: body.clientId } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");

  const statusId = await defaultStatusId(client.id);
  let created = 0;
  let duplicates = 0;
  let failed = 0;

  for (const row of body.rows) {
    try {
      const phone = normalizePhone(row.phone);
      const email = normalizeEmail(row.email);
      if (!phone && !email && !row.fullName?.trim()) {
        failed++;
        continue;
      }
      // Dedupe across ALL time for imports (not just 24h) — same phone/email.
      const dup =
        phone || email
          ? await prisma.lead.findFirst({
              where: {
                clientId: client.id,
                archived: false,
                OR: [
                  ...(phone ? [{ phone }] : []),
                  ...(email ? [{ email }] : []),
                ],
              },
            })
          : null;
      if (dup) {
        duplicates++;
        continue;
      }

      // תאריך מהקובץ בפירסור ישראלי; תאריך עתידי (שגיאת הקלדה) מוצמד לעכשיו.
      let receivedAt = (row.receivedAt ? parseIlDate(row.receivedAt) : null) ?? new Date();
      if (receivedAt.getTime() > Date.now()) receivedAt = new Date();
      const lead = await createLeadNumbered({
        clientId: client.id,
        kind: "manual",
        statusId,
        fullName: row.fullName?.trim() || null,
        phone,
        email,
        city: row.city?.trim() || null,
        channel: row.channel?.trim() || null,
        campaignLabel: row.campaignLabel?.trim() || null,
        consent: row.consent ?? false,
        receivedAt: isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
      });
      if (row.notes?.trim()) {
        await prisma.leadNote.create({
          data: {
            leadId: lead.id,
            authorName: actor.name,
            body: row.notes.trim(),
          },
        });
      }
      await recordActivity(lead.id, actor.name, "import", { note: "ייבוא CSV" });
      created++;
    } catch {
      failed++;
    }
  }

  await audit(
    actor,
    "leads_imported",
    "client",
    client.id,
    `${created} נוצרו, ${duplicates} כפולים, ${failed} נכשלו`
  );

  return NextResponse.json({ created, duplicates, failed });
});
