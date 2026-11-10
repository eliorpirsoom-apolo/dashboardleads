import crypto from "crypto";

// ---------------------------------------------------------------------------
// קופסת סודות — הצפנת ערכים רגישים לפני שמירה ב-DB (טוקני דפים של תיבת
// המענה החברתי). AES-256-GCM; המפתח נגזר מ-AUTH_SECRET דרך HKDF-SHA256, כך
// שאין סוד נוסף לנהל ב-Vercel. Node `crypto` בלבד (בלי תלויות native).
//
// פורמט הערך השמור:  v1.<iv>.<tag>.<ciphertext>   (base64url, בלי padding)
// Fail-closed בפרודקשן: בלי AUTH_SECRET לא מצפינים ולא מפענחים.
// ---------------------------------------------------------------------------

const DEV_SECRET = "dev-insecure-secret-change-me-in-production";
const HKDF_SALT = "dashboard-secret-box-v1";

export type SecretPurpose = "social-page-token";

function masterSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is not set in production — refusing to use secret box");
  }
  return DEV_SECRET;
}

function deriveKey(purpose: SecretPurpose): Buffer {
  // HKDF עם info לפי מטרה — מפתח שונה לכל סוג סוד, מאותו AUTH_SECRET.
  return Buffer.from(crypto.hkdfSync("sha256", masterSecret(), HKDF_SALT, purpose, 32));
}

/** הצפנה: מחרוזת → ערך אטום לשמירה ב-DB. */
export function sealSecret(plain: string, purpose: SecretPurpose): string {
  const key = deriveKey(purpose);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
}

/** פענוח: ערך מה-DB → המחרוזת המקורית. זורק על פורמט לא מוכר או ערך שזויף. */
export function openSecret(sealed: string, purpose: SecretPurpose): string {
  const [version, ivB64, tagB64, ctB64] = sealed.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("secret box: unknown format");
  }
  const key = deriveKey(purpose);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

/** האם הערך נראה כמו סוד מוצפן (ולא טקסט גלוי שנשמר בטעות). */
export function isSealed(value: string): boolean {
  return /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(value);
}
