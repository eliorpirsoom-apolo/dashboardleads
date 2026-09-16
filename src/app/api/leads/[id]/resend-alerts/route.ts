import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ApiError, requireAdmin } from "@/lib/api";
import { sendNewLeadAlert, sendLeadToMarketer } from "@/lib/hooks";
import { recordActivity } from "@/lib/leadActivity";

export const dynamic = "force-dynamic";

// POST /api/leads/[id]/resend-alerts — שליחה חוזרת של התראות "ליד חדש":
// למשתמשי הלקוח (לפי הרשאות הדיוור) ולמשווק המשויך (וואטסאפ ייעודי).
// פתוח לכל צוות המשרד (כמו ניהול הלידים); נרשם בציר הפעילות ובלוח השליחות.
export const POST = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireAdmin();
  const lead = await prisma.lead.findUnique({ where: { id: params.id }, select: { id: true, number: true } });
  if (!lead) throw new ApiError(404, "ליד לא נמצא");

  const before = await prisma.message.count({ where: { leadId: lead.id } });
  await sendNewLeadAlert(lead.id).catch((e) => console.error("[resend-alerts:client]", e));
  await sendLeadToMarketer(lead.id).catch((e) => console.error("[resend-alerts:marketer]", e));
  const after = await prisma.message.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: "desc" },
    take: Math.max(0, (await prisma.message.count({ where: { leadId: lead.id } })) - before),
    select: { channel: true, status: true, to: true, subject: true },
  });
  await recordActivity(lead.id, user.name, "create", {
    note: `שליחה חוזרת של התראות ליד חדש (${after.length} הודעות)`,
  }).catch(() => {});
  return NextResponse.json({
    ok: true,
    sent: after.length,
    messages: after.map((m) => ({ channel: m.channel, status: m.status, toTail: m.to.slice(-4), subject: m.subject })),
  });
});
