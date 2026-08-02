import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { presignDownload } from "@/lib/storage";
import { sendMessage } from "@/lib/messaging";
import {
  sendWhatsappRaw,
  sendWhatsappFile,
  whatsappConfigured,
  clientWhatsappPhone,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const WEEK = 7 * 24 * 60 * 60; // תוקף קישורי תמונה במייל

// המרת HTML עשיר לטקסט קריא (וואטסאפ) — שמירה על מעברי שורה ותבליטים.
function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(p|div|h[1-3]|li|blockquote|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

// תמונות מוטבעות מוגשות למשרד בלבד (/api/studio/media). לשליחה החוצה מחליפים
// בקישורים חתומים זמניים שהלקוח/הספק יכול לפתוח, ומחזירים את רשימת התמונות.
const MEDIA_SRC_RE = /src="\/api\/studio\/media\?key=([^"]+)"/g;
async function resolveOutboundImages(html: string, expiresIn: number) {
  const keys: string[] = [];
  let m: RegExpExecArray | null;
  MEDIA_SRC_RE.lastIndex = 0;
  while ((m = MEDIA_SRC_RE.exec(html))) {
    const key = decodeURIComponent(m[1]);
    if (!keys.includes(key)) keys.push(key);
  }
  let out = html;
  const images: { url: string; name: string; key: string }[] = [];
  for (const key of keys) {
    const name = key.split("/").pop() || "image";
    const signed = await presignDownload(key, name, expiresIn);
    if (!signed) continue;
    out = out.split(`/api/studio/media?key=${encodeURIComponent(key)}`).join(signed);
    images.push({ url: signed, name, key });
  }
  return { html: out, images };
}

const ShareBody = z.object({ channel: z.enum(["email", "whatsapp"]) });

// POST /api/design-tasks/[id]/messages/[messageId]/share — שליחת תוכן בלוק עדכון ללקוח.
export const POST = handle(async (req, { params }: { params: { id: string; messageId: string } }) => {
  const user = await requireAdmin();
  const { channel } = ShareBody.parse(await readJson(req));

  const msg = await prisma.designMessage.findFirst({
    where: { id: params.messageId, designTaskId: params.id },
  });
  if (!msg) throw new ApiError(404, "עדכון לא נמצא");
  if (msg.channel !== "internal") throw new ApiError(403, "ניתן לשלוח עדכונים פנימיים בלבד");

  const task = await prisma.designTask.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      clientId: true,
      client: {
        select: {
          name: true,
          users: { where: { active: true }, select: { email: true } },
        },
      },
    },
  });
  if (!task) throw new ApiError(404, "משימת עיצוב לא נמצאה");

  if (channel === "email") {
    const emails = Array.from(
      new Set((task.client?.users || []).map((u) => u.email).filter(Boolean) as string[])
    );
    if (emails.length === 0) throw new ApiError(400, "אין כתובת מייל ללקוח — הוסיפו משתמש לקוח עם מייל");
    const { html } = await resolveOutboundImages(msg.body, WEEK);
    const subject = `עדכון מהסטודיו — ${task.title}`;
    let anySent = false;
    for (const to of emails) {
      const res = await sendMessage({
        channel: "email",
        to,
        subject,
        body: html,
        kind: "automation",
        clientId: task.clientId,
      });
      if (res.status !== "failed") anySent = true;
    }
    if (!anySent) throw new ApiError(502, "שליחת המייל נכשלה");
  } else {
    // whatsapp
    if (!whatsappConfigured()) throw new ApiError(400, "וואטסאפ אינו מוגדר במערכת");
    const phone = await clientWhatsappPhone(task.clientId);
    if (!phone) throw new ApiError(400, "אין מספר טלפון ללקוח — הוסיפו בכרטיס הלקוח");
    const { images } = await resolveOutboundImages(msg.body, 1800);
    const text = htmlToText(msg.body);

    let sentOk = false;
    if (text) {
      const sent = await sendWhatsappRaw(phone, text);
      if (sent.ok) {
        sentOk = true;
        await prisma.whatsappMessage.create({
          data: {
            clientId: task.clientId,
            direction: "out",
            body: text,
            authorName: user.name,
            waMessageId: sent.idMessage || null,
          },
        });
      } else if (images.length === 0) {
        throw new ApiError(502, sent.error || "שליחת הוואטסאפ נכשלה");
      }
    }
    for (const img of images) {
      const sent = await sendWhatsappFile(phone, img.url, img.name, "");
      if (sent.ok) {
        sentOk = true;
        await prisma.whatsappMessage.create({
          data: {
            clientId: task.clientId,
            direction: "out",
            body: img.name,
            authorName: user.name,
            waMessageId: sent.idMessage || null,
            mediaKey: img.key,
            mediaName: img.name,
          },
        });
      }
    }
    if (!sentOk) throw new ApiError(502, "שליחת הוואטסאפ נכשלה");
  }

  const existing = (msg.sharedChannels || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!existing.includes(channel)) existing.push(channel);
  const message = await prisma.designMessage.update({
    where: { id: msg.id },
    data: { sharedChannels: existing.join(","), sharedAt: new Date() },
  });
  return NextResponse.json({ message });
});
