import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, ApiError } from "@/lib/api";
import { sendMessage, type Channel } from "@/lib/messaging";

export const dynamic = "force-dynamic";

// POST /api/messages/[id]/resend — שליחה חוזרת של הודעה שנכשלה/דולגה.
export const POST = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const original = await prisma.message.findUnique({ where: { id: params.id } });
  if (!original) throw new ApiError(404, "הודעה לא נמצאה");
  if (original.clientId) scopeClientId(user, original.clientId);
  else if (user.role !== "ADMIN") throw new ApiError(403, "אין הרשאה");

  if (original.status === "sent") {
    throw new ApiError(400, "ההודעה כבר נשלחה בהצלחה");
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
  });

  return NextResponse.json({ ok: true, status: result.status });
});
