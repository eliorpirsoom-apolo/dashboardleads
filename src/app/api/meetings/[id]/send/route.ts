import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { normalizeBullets, formatSummaryForClient } from "@/lib/meetingSummary";
import { sendWhatsappToChat } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// POST /api/meetings/[id]/send — שליחת הסיכום (בלי המטלות) לקבוצת הוואטסאפ
// של הלקוח, מהבוט של המשרד. מסמן נשלח + מתעד.
export const POST = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const m = await prisma.meetingSummary.findUnique({
    where: { id: params.id },
    include: { client: { select: { name: true, whatsappGroupChatId: true } } },
  });
  if (!m) throw new ApiError(404, "סיכום לא נמצא");
  const chatId = m.client.whatsappGroupChatId;
  if (!chatId) {
    throw new ApiError(
      400,
      "ללקוח לא מוגדרת קבוצת וואטסאפ — הגדירו אותה בהגדרות הלקוח לפני השליחה"
    );
  }

  const bullets = normalizeBullets(JSON.parse(m.bullets || "[]"));
  const visible = bullets.filter((b) => b.clientVisible);
  if (visible.length === 0) {
    throw new ApiError(400, "אין נקודות מסומנות לשליחה ללקוח (כל השורות מסומנות כמשימה פנימית)");
  }

  const body = formatSummaryForClient({
    clientName: m.client.name,
    meetingDate: m.meetingDate,
    bullets,
  });

  const res = await sendWhatsappToChat(chatId, body);
  if (!res.ok) {
    throw new ApiError(502, `שליחת הוואטסאפ נכשלה: ${res.error || "שגיאה"}`);
  }

  await prisma.meetingSummary.update({
    where: { id: m.id },
    data: { status: "sent", sentToClientAt: new Date(), sentChatId: chatId },
  });
  return NextResponse.json({ ok: true, sentPoints: visible.length });
});
