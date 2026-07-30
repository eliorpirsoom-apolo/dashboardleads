import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveClientIdByPhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// POST /api/webhooks/greenapi — קבלת הודעות וואטסאפ נכנסות מ-Green API.
// מאובטח בטוקן (Authorization: Bearer <GREENAPI_WEBHOOK_TOKEN>, או ?token=).
export async function POST(req: Request) {
  const secret = process.env.GREENAPI_WEBHOOK_TOKEN;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const qToken = url.searchParams.get("token") || "";
  if (bearer !== secret && qToken !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // גוף לא-תקין — לא מנסים שוב
  }

  try {
    if (payload?.typeWebhook !== "incomingMessageReceived") {
      return NextResponse.json({ ok: true, ignored: "type" });
    }
    const chatId: string = payload?.senderData?.chatId || "";
    if (!chatId.endsWith("@c.us")) return NextResponse.json({ ok: true, ignored: "not-private" });
    const phone = chatId.replace("@c.us", "");
    const idMessage: string | null = payload?.idMessage || null;

    // חילוץ טקסט מסוגי ההודעות הנפוצים.
    const md = payload?.messageData || {};
    let body = "";
    if (md.typeMessage === "textMessage") body = md.textMessageData?.textMessage || "";
    else if (md.typeMessage === "extendedTextMessage") body = md.extendedTextMessageData?.text || "";
    else body = "[התקבלה הודעת מדיה/קובץ בוואטסאפ]";
    if (!body.trim()) return NextResponse.json({ ok: true, ignored: "empty" });

    // דדופ לפי idMessage.
    if (idMessage) {
      const exists = await prisma.whatsappMessage.findUnique({ where: { waMessageId: idMessage }, select: { id: true } });
      if (exists) return NextResponse.json({ ok: true, dedup: true });
    }

    const clientId = await resolveClientIdByPhone(phone);
    if (!clientId) return NextResponse.json({ ok: true, ignored: "no-client" });

    await prisma.whatsappMessage.create({
      data: {
        clientId,
        direction: "in",
        body: body.trim(),
        fromPhone: phone,
        authorName: payload?.senderData?.senderName || null,
        waMessageId: idMessage,
      },
    });
    return NextResponse.json({ ok: true, stored: true });
  } catch (err) {
    console.error("[greenapi:webhook]", err);
    return NextResponse.json({ ok: true }); // תמיד 200 כדי שלא ינסה שוב אינסופית
  }
}
