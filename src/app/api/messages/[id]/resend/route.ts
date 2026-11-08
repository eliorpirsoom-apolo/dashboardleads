import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, ApiError } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";
import { sendMessage, type Channel } from "@/lib/messaging";
import { normalizePhone } from "@/lib/leads";

export const dynamic = "force-dynamic";

// POST /api/messages/[id]/resend — שליחה חוזרת של הודעה שנכשלה/דולגה.
export const POST = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  assertNotAgent(user, "שליחה חוזרת של הודעה"); // סוכן מכירות לא משגר הודעות מחדש
  const original = await prisma.message.findUnique({ where: { id: params.id } });
  if (!original) throw new ApiError(404, "הודעה לא נמצאה");
  if (original.clientId) scopeClientId(user, original.clientId);
  else if (user.role !== "ADMIN") throw new ApiError(403, "אין הרשאה");

  if (original.status === "sent") {
    throw new ApiError(400, "ההודעה כבר נשלחה בהצלחה");
  }

  // הודעת וואטסאפ שמופנית ללקוח הפונה עצמו חייבת לצאת מהמופע של הלקוח (ולא
  // מהמספר של הסוכנות). הדגל לא נשמר על ההודעה, אז משחזרים אותו לפי התאמת
  // הנמען לטלפון הליד — כך resend לא שולח ללקוח מהמספר הלא-נכון.
  let viaClientWa = false;
  if (original.channel === "whatsapp" && original.leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: original.leadId },
      select: { phone: true },
    });
    if (lead?.phone && normalizePhone(lead.phone) === normalizePhone(original.to)) {
      viaClientWa = true;
    }
  }

  const result = await sendMessage({
    channel: original.channel as Channel,
    to: original.to,
    subject: original.subject ?? undefined,
    body: original.body,
    kind: (original.kind as any) ?? "system",
    clientId: original.clientId,
    leadId: original.leadId,
    broadcastId: original.broadcastId,
    automationId: original.automationId, // משמר cooldown פר-אוטומציה
    mediaKey: original.channel === "whatsapp" ? original.mediaKey : null,
    mediaName: original.channel === "whatsapp" ? original.mediaName : null,
    viaClientWa,
  });

  return NextResponse.json({ ok: true, status: result.status });
});
