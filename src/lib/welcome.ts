import { sendMessage, channelConfigured } from "./messaging";
import { appBaseUrl } from "./unsubscribe";

// "ברוכים הבאים" — הזמנה ללקוח חדש להתחבר לדשבורד. מייל תמיד (SMTP חי);
// SMS/וואטסאפ נשלחים בנוסף רק אם ספק כבר מחובר (אחרת מדולגים בשקט).
export async function sendWelcome(opts: {
  clientId: string | null;
  name: string;
  email: string;
  phone?: string | null;
}): Promise<{ email: boolean; sms: boolean; whatsapp: boolean }> {
  const loginUrl = `${appBaseUrl()}/login`;
  const firstName = opts.name.split(" ")[0];

  const emailBody =
    `שלום ${firstName},\n\n` +
    `נפתח עבורכם דשבורד לניהול הפעילות הדיגיטלית שלכם ב-Apollo.\n` +
    `בדשבורד תוכלו לראות בזמן אמת את הלידים, הדוחות ותוכנית העבודה (גאנט).\n\n` +
    `להתחברות: ${loginUrl}\n` +
    `הכניסה מהירה ומאובטחת — בלחיצה על "התחברות עם Google", עם כתובת המייל ${opts.email}.\n\n` +
    `נשמח לעמוד לרשותכם,\nצוות Apollo`;

  const smsBody =
    `ברוכים הבאים ל-Apollo! נפתח עבורכם דשבורד לניהול הפעילות. ` +
    `להתחברות (עם Google, ${opts.email}): ${loginUrl}`;

  const out = { email: false, sms: false, whatsapp: false };

  const emailRes = await sendMessage({
    channel: "email",
    to: opts.email,
    subject: "ברוכים הבאים לדשבורד Apollo 🎉",
    body: emailBody,
    kind: "system",
    clientId: opts.clientId,
  });
  out.email = emailRes.status === "sent";

  // SMS/וואטסאפ — רק אם יש טלפון וספק מחובר (בלי ליצור רעש של "דולג").
  if (opts.phone) {
    if (channelConfigured("sms")) {
      const r = await sendMessage({
        channel: "sms",
        to: opts.phone,
        body: smsBody,
        kind: "system",
        clientId: opts.clientId,
      });
      out.sms = r.status === "sent";
    }
    if (channelConfigured("whatsapp")) {
      const r = await sendMessage({
        channel: "whatsapp",
        to: opts.phone,
        body: smsBody,
        kind: "system",
        clientId: opts.clientId,
      });
      out.whatsapp = r.status === "sent";
    }
  }
  return out;
}
