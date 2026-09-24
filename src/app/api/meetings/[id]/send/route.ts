import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { normalizeBullets, formatSummaryForClient } from "@/lib/meetingSummary";
import { sendWhatsappToChat } from "@/lib/whatsapp";
import { sendMessage } from "@/lib/messaging";

export const dynamic = "force-dynamic";

const Body = z.object({
  // ערוצי שליחה: וואטסאפ לקבוצה ו/או מייל לאיש הקשר של הלקוח.
  channel: z.enum(["whatsapp", "email", "both"]).default("whatsapp"),
  // קבוצת יעד — לקוח עם כמה קבוצות (פרויקטים) בוחר בכל שליחה.
  chatId: z.string().max(60).optional(),
  remember: z.boolean().optional(),
});

// POST /api/meetings/[id]/send — שליחת הסיכום (בלי המטלות) לוואטסאפ/מייל.
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const b = Body.parse(await readJson(req).catch(() => ({})));
  const m = await prisma.meetingSummary.findUnique({
    where: { id: params.id },
    include: { client: { select: { id: true, name: true, whatsappGroupChatId: true, contactEmail: true } } },
  });
  if (!m) throw new ApiError(404, "סיכום לא נמצא");

  const bullets = normalizeBullets(JSON.parse(m.bullets || "[]"));
  const visible = bullets.filter((x) => x.clientVisible);
  if (visible.length === 0) {
    throw new ApiError(400, "אין נקודות מסומנות לשליחה ללקוח (כל השורות מסומנות כמשימה פנימית)");
  }
  const body = formatSummaryForClient({ clientName: m.client.name, meetingDate: m.meetingDate, bullets });

  const wantWa = b.channel === "whatsapp" || b.channel === "both";
  const wantEmail = b.channel === "email" || b.channel === "both";
  const results: string[] = [];

  if (wantWa) {
    const chatId = (b.chatId || m.client.whatsappGroupChatId || "").trim();
    if (!chatId || !chatId.endsWith("@g.us")) throw new ApiError(400, "בחרו קבוצת וואטסאפ תקינה לשליחה");
    if (b.remember && chatId !== m.client.whatsappGroupChatId) {
      await prisma.client.update({ where: { id: m.client.id }, data: { whatsappGroupChatId: chatId } });
    }
    const res = await sendWhatsappToChat(chatId, body);
    if (!res.ok) throw new ApiError(502, `שליחת הוואטסאפ נכשלה: ${res.error || "שגיאה"}`);
    await prisma.meetingSummary.update({ where: { id: m.id }, data: { sentChatId: chatId } });
    results.push("וואטסאפ");
  }

  if (wantEmail) {
    const email = m.client.contactEmail;
    if (!email) throw new ApiError(400, "ללקוח לא מוגדר אימייל איש קשר — הוסיפו אותו בכרטיס הלקוח");
    const r = await sendMessage({
      channel: "email",
      to: email,
      subject: `סיכום פגישה — ${m.client.name}`,
      body: body.replace(/\*/g, ""), // בלי סימוני bold של וואטסאפ במייל
      kind: "automation",
      clientId: m.client.id,
    });
    if (r.status === "failed") throw new ApiError(502, "שליחת המייל נכשלה");
    results.push("מייל");
  }

  await prisma.meetingSummary.update({
    where: { id: m.id },
    data: { status: "sent", sentToClientAt: new Date() },
  });
  return NextResponse.json({ ok: true, sentPoints: visible.length, channels: results });
});
