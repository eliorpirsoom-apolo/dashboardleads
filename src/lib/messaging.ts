import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// Unified messaging layer. ALL outgoing communication flows through
// sendMessage(): it logs to the Message table and dispatches through the
// channel adapter. Channels without a configured provider mark the message
// "skipped" (visible in the log) instead of failing the caller — so the whole
// system works end-to-end before any provider is connected.
//
// Channels: email (SMTP; console fallback in dev) | sms | whatsapp (Phase 3
// adapters — generic HTTP provider + WhatsApp Business Cloud API).
// ---------------------------------------------------------------------------

export type Channel = "email" | "sms" | "whatsapp";

export interface OutgoingMessage {
  channel: Channel;
  to: string;
  subject?: string;
  body: string;
  kind?: "reminder" | "automation" | "broadcast" | "system";
  clientId?: string | null;
  leadId?: string | null;
  broadcastId?: string | null;
  automationId?: string | null;
  // מדיה מצורפת (וואטסאפ בלבד): מפתח R2 — נשלח כקובץ עם ה-body ככיתוב.
  mediaKey?: string | null;
  mediaName?: string | null;
  // וואטסאפ מהמופע הייעודי של הלקוח (Green API של הלקוח) — ללא נפילה חזרה
  // למופע הסוכנות: אם ללקוח אין מופע מחובר, ההודעה נכשלת עם שגיאה ברורה.
  viaClientWa?: boolean;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

export function smsConfigured(): boolean {
  return Boolean(process.env.MULTISEND_USER && process.env.MULTISEND_PASSWORD);
}

export function whatsappConfigured(): boolean {
  return Boolean(
    process.env.GREENAPI_ID_INSTANCE && process.env.GREENAPI_API_TOKEN
  );
}

export function channelConfigured(channel: Channel): boolean {
  if (channel === "email") return emailConfigured();
  if (channel === "sms") return smsConfigured();
  return whatsappConfigured();
}

// --- Channel adapters --------------------------------------------------------

async function sendEmail(to: string, subject: string, body: string) {
  if (!emailConfigured()) {
    // Dev fallback: log instead of send, so flows are fully testable.
    console.log(`[email:dev] to=${to} subject="${subject}"\n${body}`);
    return { skipped: true as const };
  }
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== "false",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  await transport.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;white-space:pre-line">${body}</div>`,
  });
  return { skipped: false as const };
}

async function sendSms(to: string, body: string) {
  if (!smsConfigured()) {
    console.log(`[sms:not-configured] to=${to}: ${body}`);
    return { skipped: true as const };
  }
  // MultiSend (מולטיסנד) — ספק ה-SMS של פייקול. POST form-urlencoded.
  // מפרט: /MultiSendAPI/sendsms עם user,password,from,recipient,message.
  const url =
    process.env.SMS_API_URL || "https://api.multisend.co.il/MultiSendAPI/sendsms";
  const digits = to.replace(/[^\d+]/g, "");
  // מטען מינימלי מוכח: user,password,from,recipient,message (בלי message_type —
  // ברירת המחדל היא SMS; ערכי ה-enum שתועדו במקום אחר נדחו על-ידי ה-API).
  const params = new URLSearchParams({
    user: process.env.MULTISEND_USER!,
    password: process.env.MULTISEND_PASSWORD!,
    from: process.env.SMS_FROM || "Apollo",
    recipient: digits,
    message: body,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MultiSend HTTP ${res.status}: ${text.slice(0, 200)}`);
  // התשובה בד"כ JSON: { success, message, smsCount, error }.
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* תשובה לא-JSON — נסתמך על סטטוס 200 */
  }
  if (json && json.success === false) {
    const errMsg =
      json.message || (json.error ? JSON.stringify(json.error) : "שגיאת MultiSend");
    throw new Error(`MultiSend: ${errMsg}`);
  }
  return { skipped: false as const };
}

async function sendWhatsapp(to: string, body: string) {
  if (!whatsappConfigured()) {
    console.log(`[whatsapp:not-configured] to=${to}: ${body}`);
    return { skipped: true as const };
  }
  // Green API (וואטסאפ לא-רשמי): POST {apiUrl}/waInstance{id}/sendMessage/{token}.
  const id = process.env.GREENAPI_ID_INSTANCE!;
  const token = process.env.GREENAPI_API_TOKEN!;
  const base = (process.env.GREENAPI_API_URL || "https://api.green-api.com").replace(/\/$/, "");
  // מספר ישראלי → פורמט בינ"ל בלי + וללא 0 מוביל, סיומת @c.us.
  const digits = to.replace(/\D/g, "");
  const intl = digits.startsWith("972")
    ? digits
    : digits.startsWith("0")
      ? `972${digits.slice(1)}`
      : digits;
  const res = await fetch(`${base}/waInstance${id}/sendMessage/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId: `${intl}@c.us`, message: body }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Green API HTTP ${res.status}: ${text.slice(0, 200)}`);
  return { skipped: false as const };
}

// וואטסאפ עם קובץ מדיה (וידאו/תמונה) מ-R2: מפיקים קישור חתום זמני ושולחים
// דרך sendFileByUrl של Green API — ההודעה מגיעה כקובץ אחד עם כיתוב.
async function sendWhatsappMedia(
  to: string,
  mediaKey: string,
  mediaName: string | null | undefined,
  caption: string,
  creds: { id: string; token: string } | null
) {
  if (!creds && !whatsappConfigured()) {
    console.log(`[whatsapp:not-configured] to=${to} media=${mediaKey}`);
    return { skipped: true as const };
  }
  const { presignDownload } = await import("./storage");
  const { sendWhatsappFile } = await import("./whatsapp");
  const name = mediaName || mediaKey.split("/").pop() || "file";
  const url = await presignDownload(mediaKey, name);
  if (!url) throw new Error("לא ניתן להפיק קישור למדיה מהאחסון");
  const sent = await sendWhatsappFile(to, url, name, caption, creds);
  if (!sent.ok) throw new Error(sent.error || "שליחת המדיה נכשלה");
  return { skipped: false as const };
}

// --- The single entry point ---------------------------------------------------

export async function sendMessage(msg: OutgoingMessage): Promise<{
  id: string;
  status: "sent" | "failed" | "skipped";
}> {
  const record = await prisma.message.create({
    data: {
      channel: msg.channel,
      to: msg.to,
      subject: msg.subject ?? null,
      body: msg.body,
      kind: msg.kind ?? "system",
      clientId: msg.clientId ?? null,
      leadId: msg.leadId ?? null,
      broadcastId: msg.broadcastId ?? null,
      automationId: msg.automationId ?? null,
      mediaKey: msg.mediaKey ?? null,
      mediaName: msg.mediaName ?? null,
      status: "pending",
    },
  });

  let status: "sent" | "failed" | "skipped" = "sent";
  let error: string | null = null;

  const dispatch = async () => {
    if (msg.channel === "email") {
      return sendEmail(msg.to, msg.subject ?? "עדכון מהמערכת", msg.body);
    }
    if (msg.channel === "sms") return sendSms(msg.to, msg.body);
    // וואטסאפ: הודעות ללקוח הפונה יוצאות מהמופע של הלקוח בלבד (viaClientWa).
    let creds: { id: string; token: string } | null = null;
    if (msg.viaClientWa) {
      if (!msg.clientId) throw new Error("חסר לקוח לשליחה מהמופע הייעודי");
      const { clientWaCreds } = await import("./whatsapp");
      creds = await clientWaCreds(msg.clientId);
      if (!creds) {
        throw new Error(
          "ללקוח אין מופע וואטסאפ מחובר (הגדרות לקוח ⟵ אינטגרציות ⟵ וואטסאפ ייעודי) — ההודעה לא נשלחה"
        );
      }
    }
    // וואטסאפ עם מדיה: הקובץ נשלח מ-R2 בקישור חתום, וה-body הופך לכיתוב.
    if (msg.mediaKey) return sendWhatsappMedia(msg.to, msg.mediaKey, msg.mediaName, msg.body, creds);
    if (creds) {
      const { sendWhatsappRaw } = await import("./whatsapp");
      const sent = await sendWhatsappRaw(msg.to, msg.body, creds);
      if (!sent.ok) throw new Error(sent.error || "שליחת הוואטסאפ נכשלה");
      return { skipped: false as const };
    }
    return sendWhatsapp(msg.to, msg.body);
  };

  try {
    let result: { skipped: boolean };
    try {
      result = await dispatch();
    } catch (firstErr) {
      // ניסיון חוזר אוטומטי אחד לכשל רגעי (רשת/ספק).
      await new Promise((r) => setTimeout(r, 1500));
      result = await dispatch();
    }
    if (result.skipped) status = "skipped";
  } catch (err: any) {
    status = "failed";
    error = String(err?.message ?? err).slice(0, 500);
    console.error(`[messaging:${msg.channel}]`, err);
  }

  await prisma.message.update({
    where: { id: record.id },
    data: { status, error, sentAt: status === "sent" ? new Date() : null },
  });
  return { id: record.id, status };
}

/** Simple {{key}} template rendering for automations/reminders. */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    vars[key] === null || vars[key] === undefined ? "" : String(vars[key])
  );
}
