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
}

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

export function smsConfigured(): boolean {
  return Boolean(process.env.SMS_API_URL && process.env.SMS_API_TOKEN);
}

export function whatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_ID
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
  // Generic HTTP SMS provider (019-style JSON API). Configured via env.
  const res = await fetch(process.env.SMS_API_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SMS_API_TOKEN}`,
    },
    body: JSON.stringify({
      to,
      from: process.env.SMS_FROM || "CRM",
      message: body,
    }),
  });
  if (!res.ok) throw new Error(`SMS provider HTTP ${res.status}`);
  return { skipped: false as const };
}

async function sendWhatsapp(to: string, body: string) {
  if (!whatsappConfigured()) {
    console.log(`[whatsapp:not-configured] to=${to}: ${body}`);
    return { skipped: true as const };
  }
  // WhatsApp Business Cloud API (Meta).
  const url =
    process.env.WHATSAPP_API_URL ||
    `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  const intl = to.startsWith("0") ? `972${to.slice(1)}` : to.replace("+", "");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: intl,
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp API HTTP ${res.status}`);
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
