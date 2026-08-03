import { prisma } from "./prisma";
import { sendMessage } from "./messaging";
import { maybeHandleTaskAgent } from "./taskAgent";

const APP_URL = process.env.APP_BASE_URL || "https://dashboard-leads-apollo13.vercel.app";

function gaBase(): string {
  return (process.env.GREENAPI_API_URL || "https://api.green-api.com").replace(/\/$/, "");
}

// מספר ישראלי → פורמט בינ"ל (972, בלי + וללא 0 מוביל).
export function waIntl(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

export function whatsappConfigured(): boolean {
  return Boolean(process.env.GREENAPI_ID_INSTANCE && process.env.GREENAPI_API_TOKEN);
}

// שליחת הודעת וואטסאפ דרך Green API. מחזיר את idMessage לשמירה/דדופ.
export async function sendWhatsappRaw(
  to: string,
  body: string
): Promise<{ ok: boolean; idMessage?: string; error?: string }> {
  if (!whatsappConfigured()) return { ok: false, error: "וואטסאפ אינו מוגדר" };
  const id = process.env.GREENAPI_ID_INSTANCE!;
  const token = process.env.GREENAPI_API_TOKEN!;
  const base = (process.env.GREENAPI_API_URL || "https://api.green-api.com").replace(/\/$/, "");
  const intl = waIntl(to);
  if (!intl) return { ok: false, error: "מספר לא תקין" };
  try {
    const res = await fetch(`${base}/waInstance${id}/sendMessage/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: `${intl}@c.us`, message: body }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `Green API HTTP ${res.status}: ${text.slice(0, 200)}` };
    let idMessage: string | undefined;
    try {
      idMessage = JSON.parse(text)?.idMessage;
    } catch {
      /* ignore */
    }
    return { ok: true, idMessage };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

// שליחת קובץ/מדיה בוואטסאפ דרך Green API (sendFileByUrl). urlFile חייב להיות נגיש לגרין-API.
export async function sendWhatsappFile(
  to: string,
  urlFile: string,
  fileName: string,
  caption?: string
): Promise<{ ok: boolean; idMessage?: string; error?: string }> {
  if (!whatsappConfigured()) return { ok: false, error: "וואטסאפ אינו מוגדר" };
  const id = process.env.GREENAPI_ID_INSTANCE!;
  const token = process.env.GREENAPI_API_TOKEN!;
  const intl = waIntl(to);
  if (!intl) return { ok: false, error: "מספר לא תקין" };
  try {
    const res = await fetch(`${gaBase()}/waInstance${id}/sendFileByUrl/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: `${intl}@c.us`, urlFile, fileName, caption: caption || "" }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `Green API HTTP ${res.status}: ${text.slice(0, 200)}` };
    let idMessage: string | undefined;
    try {
      idMessage = JSON.parse(text)?.idMessage;
    } catch {
      /* ignore */
    }
    return { ok: true, idMessage };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

// תמונת הפרופיל בוואטסאפ של מספר (Green API getAvatar) — best-effort.
export async function getWhatsappAvatar(phone: string): Promise<string | null> {
  if (!whatsappConfigured()) return null;
  const intl = waIntl(phone);
  if (!intl) return null;
  try {
    const id = process.env.GREENAPI_ID_INSTANCE!;
    const token = process.env.GREENAPI_API_TOKEN!;
    const res = await fetch(`${gaBase()}/waInstance${id}/getAvatar/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: `${intl}@c.us` }),
    });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    return j?.urlAvatar || null;
  } catch {
    return null;
  }
}

// התראה לצד המשרד על הודעת וואטסאפ נכנסת מלקוח (למעצב/ת + פותח/ת הבריף של משימות פעילות).
export async function notifyInboundWhatsapp(clientId: string, snippet: string): Promise<void> {
  const [client, tasks] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { name: true } }),
    prisma.designTask.findMany({
      where: { clientId, status: { not: "approved" } },
      select: { designer: { select: { id: true, email: true } }, createdBy: { select: { id: true, email: true } } },
      take: 50,
    }),
  ]);
  const emails = new Set<string>();
  for (const t of tasks) {
    if (t.designer?.email) emails.add(t.designer.email);
    if (t.createdBy?.email) emails.add(t.createdBy.email);
  }
  if (emails.size === 0) return;
  const body = `📱 הודעת וואטסאפ חדשה מ${client?.name || "לקוח"}:\n${snippet}\n\nלמענה: ${APP_URL}/admin/studio`;
  for (const email of emails) {
    await sendMessage({
      channel: "email",
      to: email,
      subject: `📱 וואטסאפ מלקוח — ${client?.name || ""}`.trim(),
      body,
      kind: "automation",
      clientId,
    }).catch(() => {});
  }
}

// זיהוי הלקוח מתוך מספר טלפון נכנס (השוואה מנורמלת מול טלפון איש קשר / משתמשי הלקוח).
export async function resolveClientIdByPhone(phone: string): Promise<string | null> {
  const target = waIntl(phone);
  if (!target) return null;
  const [clients, users] = await Promise.all([
    prisma.client.findMany({ where: { contactPhone: { not: null } }, select: { id: true, contactPhone: true } }),
    prisma.user.findMany({
      where: { phone: { not: null }, clientId: { not: null } },
      select: { clientId: true, phone: true },
    }),
  ]);
  for (const c of clients) {
    if (c.contactPhone && waIntl(c.contactPhone) === target) return c.id;
  }
  for (const u of users) {
    if (u.phone && u.clientId && waIntl(u.phone) === target) return u.clientId;
  }
  return null;
}

// עיבוד הודעת וואטסאפ נכנסת (מ-Green API): חילוץ, זיהוי לקוח, דדופ ושמירה.
export async function ingestInboundWhatsapp(payload: any): Promise<{ stored: boolean; reason?: string }> {
  if (payload?.typeWebhook !== "incomingMessageReceived") return { stored: false, reason: "type" };
  const chatId: string = payload?.senderData?.chatId || "";
  if (!chatId.endsWith("@c.us")) return { stored: false, reason: "not-private" };
  const phone = chatId.replace("@c.us", "");
  const idMessage: string | null = payload?.idMessage || null;

  const md = payload?.messageData || {};
  let body = "";
  let mediaUrl: string | null = null;
  let mediaName: string | null = null;
  let mediaMime: string | null = null;
  if (md.typeMessage === "textMessage") body = md.textMessageData?.textMessage || "";
  else if (md.typeMessage === "extendedTextMessage") body = md.extendedTextMessageData?.text || "";
  else if (md.fileMessageData) {
    // imageMessage / documentMessage / videoMessage / audioMessage
    mediaUrl = md.fileMessageData.downloadUrl || null;
    mediaName = md.fileMessageData.fileName || null;
    mediaMime = md.fileMessageData.mimeType || null;
    body = md.fileMessageData.caption || mediaName || "[קובץ מדיה מהלקוח]";
  } else body = "[התקבלה הודעה בוואטסאפ]";
  if (!body.trim() && !mediaUrl) return { stored: false, reason: "empty" };

  // סוכן משימות: הודעה ממספר מורשה → חילוץ משימות למאגר (לא נשמרת כשיחת לקוח).
  try {
    const senderName = payload?.senderData?.senderName || null;
    const handled = await maybeHandleTaskAgent({ phone, body, senderName, idMessage });
    if (handled) return { stored: true, reason: "task-agent" };
  } catch (e) {
    console.error("[task-agent]", e);
  }

  if (idMessage) {
    const exists = await prisma.whatsappMessage.findUnique({ where: { waMessageId: idMessage }, select: { id: true } });
    if (exists) return { stored: false, reason: "dedup" };
  }
  const clientId = await resolveClientIdByPhone(phone);
  if (!clientId) return { stored: false, reason: "no-client" };

  // השהיית התראה: אם התקבלה הודעה נכנסת ב-15 הדק' האחרונות — לא שולחים שוב (שלא יציף בשיחה ערה).
  const recent = await prisma.whatsappMessage.findFirst({
    where: { clientId, direction: "in", createdAt: { gt: new Date(Date.now() - 15 * 60 * 1000) } },
    select: { id: true },
  });

  await prisma.whatsappMessage.create({
    data: {
      clientId,
      direction: "in",
      body: (body || "").trim() || (mediaName ?? "[מדיה]"),
      fromPhone: phone,
      authorName: payload?.senderData?.senderName || null,
      waMessageId: idMessage,
      mediaUrl,
      mediaName,
      mediaMime,
    },
  });
  if (!recent) {
    notifyInboundWhatsapp(clientId, (body || mediaName || "[מדיה]").slice(0, 200)).catch(() => {});
  }
  return { stored: true };
}

// טלפון הוואטסאפ של לקוח (איש קשר, או המשתמש הפעיל הראשון עם טלפון).
export async function clientWhatsappPhone(clientId: string): Promise<string | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      contactPhone: true,
      users: { where: { active: true, phone: { not: null } }, select: { phone: true }, take: 1 },
    },
  });
  return client?.contactPhone || client?.users?.[0]?.phone || null;
}
