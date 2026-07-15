import crypto from "crypto";

// ---------------------------------------------------------------------------
// הסרה מדיוור — קישור חתום (HMAC) שמזהה ליד, ללא צורך בהתחברות.
// נדרש לפי חוק התקשורת (תיקון 40, "חוק הספאם") בכל דיוור שיווקי.
// ---------------------------------------------------------------------------

const SECRET =
  process.env.AUTH_SECRET || "dev-insecure-secret-change-me-in-production";

export function unsubscribeToken(leadId: string): string {
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(`unsub.${leadId}`)
    .digest("hex")
    .slice(0, 32);
  return Buffer.from(`${leadId}.${sig}`).toString("base64url");
}

export function verifyUnsubscribeToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const idx = raw.lastIndexOf(".");
    if (idx <= 0) return null;
    const leadId = raw.slice(0, idx);
    const sig = raw.slice(idx + 1);
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(`unsub.${leadId}`)
      .digest("hex")
      .slice(0, 32);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return leadId;
  } catch {
    return null;
  }
}

/** Base URL of the app (production URL on Vercel, localhost in dev). */
export function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** The Hebrew unsubscribe footer appended to marketing emails. */
export function emailUnsubFooter(leadId: string): string {
  const url = `${appBaseUrl()}/unsubscribe?t=${unsubscribeToken(leadId)}`;
  return `\n\n———\nקיבלתם הודעה זו כי אישרתם קבלת דיוור. להסרה מרשימת התפוצה: ${url}`;
}
