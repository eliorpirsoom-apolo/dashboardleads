// הגנת SSRF: לפני fetch של URL שמקורו בקלט חיצוני (downloadUrl מוובהוק וכו׳),
// מוודאים שהיעד ציבורי — חוסמים localhost, כתובות פנימיות ו-cloud metadata.
export function assertSafeExternalUrl(raw: string | null | undefined): URL {
  if (!raw) throw new Error("כתובת ריקה");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("כתובת לא תקינה");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("פרוטוקול לא מורשה");
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new Error("יעד פנימי חסום");
  }
  // IPv4 פנימי / loopback / link-local (כולל 169.254.169.254 — cloud metadata)
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (
      a === 0 ||
      a === 127 ||
      a === 10 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) {
      throw new Error("יעד פנימי חסום");
    }
  }
  // IPv6 loopback / link-local / unique-local
  if (host === "::1" || host.startsWith("fe80") || host.startsWith("fc") || host.startsWith("fd")) {
    throw new Error("יעד פנימי חסום");
  }
  return u;
}
