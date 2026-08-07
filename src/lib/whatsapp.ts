import { prisma } from "./prisma";
import { sendMessage } from "./messaging";
import { maybeHandleTaskAgent, maybeHandleGroupAgent } from "./taskAgent";

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

// שליחת הודעה ל-chatId גולמי (למשל קבוצה: ...@g.us) — בלי נרמול מספר.
export async function sendWhatsappToChat(
  chatId: string,
  body: string
): Promise<{ ok: boolean; idMessage?: string; error?: string }> {
  if (!whatsappConfigured()) return { ok: false, error: "וואטסאפ אינו מוגדר" };
  const id = process.env.GREENAPI_ID_INSTANCE!;
  const token = process.env.GREENAPI_API_TOKEN!;
  try {
    const res = await fetch(`${gaBase()}/waInstance${id}/sendMessage/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message: body }),
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

// רשימת קבוצות הוואטסאפ שהמספר חבר בהן (Green API getContacts → סינון type=group).
export async function listWhatsappGroups(): Promise<{ id: string; name: string }[]> {
  if (!whatsappConfigured()) return [];
  const id = process.env.GREENAPI_ID_INSTANCE!;
  const token = process.env.GREENAPI_API_TOKEN!;
  try {
    const res = await fetch(`${gaBase()}/waInstance${id}/getContacts/${token}`);
    if (!res.ok) return [];
    const arr = await res.json().catch(() => []);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((c: any) => c?.type === "group" || String(c?.id || "").endsWith("@g.us"))
      .map((c: any) => ({ id: String(c.id), name: String(c.name || c.contactName || c.id) }))
      .filter((g) => g.id.endsWith("@g.us"));
  } catch {
    return [];
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

// זיהוי ליד לפי מספר טלפון (פורמטים נפוצים: 05X, 9725X, +9725X). הליד העדכני ביותר.
export async function resolveLeadByPhone(phone: string): Promise<{
  id: string;
  clientId: string;
  fullName: string | null;
  assignee: { name: string; whatsappPhone: string | null; active: boolean } | null;
} | null> {
  const intl = waIntl(phone);
  if (!intl) return null;
  const local = intl.startsWith("972") ? "0" + intl.slice(3) : null;
  const candidates = [intl, `+${intl}`, ...(local ? [local] : [])];
  return prisma.lead.findFirst({
    where: { archived: false, phone: { in: candidates } },
    orderBy: { receivedAt: "desc" },
    select: {
      id: true,
      clientId: true,
      fullName: true,
      assignee: { select: { name: true, whatsappPhone: true, active: true } },
    },
  });
}

// עיבוד הודעת וואטסאפ נכנסת (מ-Green API): חילוץ, זיהוי לקוח, דדופ ושמירה.
export async function ingestInboundWhatsapp(payload: any): Promise<{ stored: boolean; reason?: string }> {
  if (payload?.typeWebhook !== "incomingMessageReceived") return { stored: false, reason: "type" };
  const chatId: string = payload?.senderData?.chatId || "";
  const isGroup = chatId.endsWith("@g.us");
  const isPrivate = chatId.endsWith("@c.us");
  if (!isGroup && !isPrivate) return { stored: false, reason: "not-supported" };
  const idMessage: string | null = payload?.idMessage || null;

  const md = payload?.messageData || {};
  let body = "";
  let mediaUrl: string | null = null;
  let mediaName: string | null = null;
  let mediaMime: string | null = null;
  if (md.typeMessage === "textMessage") body = md.textMessageData?.textMessage || "";
  else if (md.typeMessage === "extendedTextMessage" || md.typeMessage === "quotedMessage")
    body = md.extendedTextMessageData?.text || "";
  else if (md.fileMessageData) {
    // imageMessage / documentMessage / videoMessage / audioMessage
    mediaUrl = md.fileMessageData.downloadUrl || null;
    mediaName = md.fileMessageData.fileName || null;
    mediaMime = md.fileMessageData.mimeType || null;
    body = md.fileMessageData.caption || mediaName || "[קובץ מדיה מהלקוח]";
  } else body = "[התקבלה הודעה בוואטסאפ]";

  // טקסט הודעה מצוטטת (Reply) — לסוכן: לקיחת משימה מהודעה של מישהו אחר.
  const q: any = md?.quotedMessage;
  const quotedText: string | null = q
    ? q.textMessage || q.extendedTextMessageData?.text || q.caption || q.fileMessageData?.caption || null
    : null;

  if (!body.trim() && !mediaUrl && !quotedText) return { stored: false, reason: "empty" };

  // קבוצות וואטסאפ: אם ההודעה קוראת בשם הסוכן ("יעקב") → חילוץ משימה למאגר + תגובה בקבוצה.
  // הודעות קבוצה אינן נשמרות כשיחת לקוח.
  if (isGroup) {
    try {
      const handled = await maybeHandleGroupAgent({
        groupId: chatId,
        groupName: payload?.senderData?.chatName || null,
        body,
        senderName: payload?.senderData?.senderName || null,
        idMessage,
        quotedText,
      });
      return { stored: handled, reason: handled ? "group-agent" : "group-ignored" };
    } catch (e) {
      console.error("[group-agent]", e);
      return { stored: false, reason: "group-error" };
    }
  }

  const phone = chatId.replace("@c.us", "");

  // סוכן משימות: הודעה ממספר מורשה → חילוץ משימות למאגר (לא נשמרת כשיחת לקוח).
  try {
    const senderName = payload?.senderData?.senderName || null;
    const handled = await maybeHandleTaskAgent({ phone, body, senderName, idMessage, quotedText });
    if (handled) return { stored: true, reason: "task-agent" };
  } catch (e) {
    console.error("[task-agent]", e);
  }

  if (idMessage) {
    const exists = await prisma.whatsappMessage.findUnique({ where: { waMessageId: idMessage }, select: { id: true } });
    if (exists) return { stored: false, reason: "dedup" };
  }
  const clientId = await resolveClientIdByPhone(phone);
  if (!clientId) {
    // לא איש קשר של לקוח — אולי ליד? משרשרים לשיחת הליד בכרטיס שלו.
    const lead = await resolveLeadByPhone(phone);
    if (!lead) return { stored: false, reason: "no-client" };
    await prisma.whatsappMessage.create({
      data: {
        clientId: lead.clientId,
        leadId: lead.id,
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
    // עדכון המשווק שהליד הגיב — עם צינון 15 דק' לשיחה ערה.
    if (lead.assignee?.whatsappPhone && lead.assignee.active) {
      const recentIn = await prisma.whatsappMessage.findFirst({
        where: {
          leadId: lead.id,
          direction: "in",
          createdAt: { gt: new Date(Date.now() - 15 * 60 * 1000) },
          ...(idMessage ? { waMessageId: { not: idMessage } } : {}),
        },
        select: { id: true },
      });
      if (!recentIn) {
        const preview = (body || mediaName || "[מדיה]").slice(0, 120);
        await sendWhatsappRaw(
          lead.assignee.whatsappPhone,
          `💬 ${lead.fullName || phone} הגיב לך בוואטסאפ:\n"${preview}"\n\nהשב מכרטיס הליד במערכת.`
        ).catch(() => {});
      }
    }
    return { stored: true, reason: "lead-chat" };
  }

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
