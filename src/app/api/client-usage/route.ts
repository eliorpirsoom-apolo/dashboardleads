import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/client-usage?month=YYYY-MM — שימוש חודשי פר לקוח (מנהלים בלבד):
// לידים, שיחות מתומללות, SMS, וואטסאפ, מיילים + עלות צד-ג' משוערת משויכת.
// המטרה: לזהות לקוחות "כבדים" ולתמחר דמי טכנולוגיה בהתאם.
export const GET = handle(async (req) => {
  await requireManager();
  const month = new URL(req.url).searchParams.get("month") || "";
  if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError(400, "חודש לא תקין (YYYY-MM)");
  const [y, m] = month.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 1);
  const range = { gte: from, lt: to };

  const [clients, leads, transcribed, messages, smsRate] = await Promise.all([
    prisma.client.findMany({ where: { active: true }, select: { id: true, name: true, color: true } }),
    prisma.lead.groupBy({ by: ["clientId"], where: { createdAt: range }, _count: { _all: true } }),
    prisma.lead.groupBy({
      by: ["clientId"],
      where: { kind: "call", callTranscriptStatus: { in: ["done", "no_speech"] }, createdAt: range },
      _count: { _all: true },
    }),
    prisma.message.groupBy({
      by: ["clientId", "channel"],
      where: { status: "sent", createdAt: range, clientId: { not: null } },
      _count: { _all: true },
    }),
    prisma.supplierCost.findFirst({ where: { estimator: "sms" }, select: { unitRate: true } }),
  ]);

  const smsUnit = smsRate?.unitRate ?? 0.07; // ₪ ל-SMS
  const leadsOf = new Map(leads.filter((x) => x.clientId).map((x) => [x.clientId, x._count._all]));
  const callsOf = new Map(transcribed.filter((x) => x.clientId).map((x) => [x.clientId, x._count._all]));
  const msgOf = (cid: string, ch: string) =>
    messages.find((x) => x.clientId === cid && x.channel === ch)?._count._all ?? 0;

  const rows = clients
    .map((c) => {
      const calls = callsOf.get(c.id) ?? 0;
      const sms = msgOf(c.id, "sms");
      return {
        client: c,
        leads: leadsOf.get(c.id) ?? 0,
        calls,
        sms,
        whatsapp: msgOf(c.id, "whatsapp"),
        emails: msgOf(c.id, "email"),
        // תמלול+סיכום: ≈3 דק' לשיחה × $0.006/דק' + $0.002 סיכום.
        costUsd: Math.round(calls * (3 * 0.006 + 0.002) * 100) / 100,
        costIls: Math.round(sms * smsUnit * 100) / 100,
      };
    })
    .filter((r) => r.leads || r.calls || r.sms || r.whatsapp || r.emails)
    .sort((a, b) => b.leads + b.calls * 3 - (a.leads + a.calls * 3));

  const totals = rows.reduce(
    (t, r) => ({
      leads: t.leads + r.leads,
      calls: t.calls + r.calls,
      sms: t.sms + r.sms,
      whatsapp: t.whatsapp + r.whatsapp,
      emails: t.emails + r.emails,
      costUsd: Math.round((t.costUsd + r.costUsd) * 100) / 100,
      costIls: Math.round((t.costIls + r.costIls) * 100) / 100,
    }),
    { leads: 0, calls: 0, sms: 0, whatsapp: 0, emails: 0, costUsd: 0, costIls: 0 }
  );

  return NextResponse.json({ month, rows, totals });
});
