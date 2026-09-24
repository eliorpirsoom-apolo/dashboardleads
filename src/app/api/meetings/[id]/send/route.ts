import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { normalizeBullets, formatSummaryForClient } from "@/lib/meetingSummary";
import { sendWhatsappToChat } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const Body = z.object({
  // קבוצת יעד לשליחה — לקוח עם כמה קבוצות (פרויקטים) בוחר בכל שליחה.
  chatId: z.string().max(60).optional(),
  remember: z.boolean().optional(), // לשמור כברירת המחדל של הלקוח
});

// POST /api/meetings/[id]/send — שליחת הסיכום (בלי המטלות) לקבוצת וואטסאפ,
// מהבוט של המשרד. chatId אופציונלי (ברירת מחדל: הקבוצה השמורה ללקוח).
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const b = Body.parse(await readJson(req).catch(() => ({})));
  const m = await prisma.meetingSummary.findUnique({
    where: { id: params.id },
    include: { client: { select: { id: true, name: true, whatsappGroupChatId: true } } },
  });
  if (!m) throw new ApiError(404, "סיכום לא נמצא");
  const chatId = (b.chatId || m.client.whatsappGroupChatId || "").trim();
  if (!chatId || !chatId.endsWith("@g.us")) {
    throw new ApiError(400, "בחרו קבוצת וואטסאפ תקינה לשליחה");
  }
  if (b.remember && chatId !== m.client.whatsappGroupChatId) {
    await prisma.client.update({ where: { id: m.client.id }, data: { whatsappGroupChatId: chatId } });
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
