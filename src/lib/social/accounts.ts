import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { sealSecret, openSecret } from "@/lib/secretBox";
import { getPageToken, syncPageSubscription } from "@/lib/integrations/metaLeads";

// ---------------------------------------------------------------------------
// תיבת מענה חברתי — חיבור/ניתוק דף (SocialAccount). משתמש באותה זרימת OAuth
// של הלידים (connect?purpose=social → callback → attach), אבל שומר רשומה
// נפרדת מ-MetaPage: טוקן מוצפן, חשבון IG מקושר, ורישום לשדות feed/messages
// באיחוד עם leadgen (ראו syncPageSubscription).
// ---------------------------------------------------------------------------

const GRAPH = "https://graph.facebook.com/v21.0";

/** השדות שמותר להחזיר ל-UI — לעולם לא pageTokenEnc. */
export const SOCIAL_ACCOUNT_PUBLIC = {
  id: true,
  clientId: true,
  platform: true,
  pageId: true,
  pageName: true,
  igUserId: true,
  igUsername: true,
  tokenValid: true,
  active: true,
  lastError: true,
  lastEventAt: true,
  createdAt: true,
  _count: { select: { threads: true } },
} as const;

/** חשבון האינסטגרם העסקי המקושר לדף (אם יש, ואם ניתנה הרשאת instagram_basic). */
export async function fetchLinkedInstagram(
  pageId: string,
  pageToken: string
): Promise<{ id: string; username: string | null } | null> {
  try {
    const res = await fetch(
      `${GRAPH}/${pageId}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    const ig = res.ok ? data?.instagram_business_account : null;
    if (!ig?.id) return null;
    return { id: String(ig.id), username: ig.username ? String(ig.username) : null };
  } catch {
    return null;
  }
}

/**
 * חיבור דף לתיבת המענה: טוקן דף ← חשבון IG מקושר ← רישום לוובהוק (איחוד עם
 * לידים) ← שמירה עם טוקן מוצפן. הרישום נעשה לפני הכתיבה ל-DB כדי שלא יישאר
 * חיבור מת. דף שכבר היה מחובר ונותק — מופעל מחדש באותה רשומה (השרשורים נשארים).
 */
export async function connectSocialAccount(opts: {
  clientId: string;
  pageId: string;
  pageNameHint?: string;
  userToken: string;
  userId?: string;
}): Promise<{ accountId: string; pageName: string; igLinked: boolean; fields: string[] }> {
  const existing = await prisma.socialAccount.findUnique({ where: { pageId: opts.pageId } });
  if (existing?.active) {
    throw new ApiError(
      409,
      existing.clientId === opts.clientId
        ? "הדף כבר מחובר לתיבת המענה"
        : "הדף כבר מחובר לתיבת המענה של לקוח אחר"
    );
  }
  if (existing && existing.clientId !== opts.clientId) {
    throw new ApiError(409, "הדף היה מחובר לתיבת המענה של לקוח אחר — פנו למנהל המערכת");
  }

  const page = await getPageToken(opts.pageId, opts.userToken);
  const pageName = (page.name || opts.pageNameHint || opts.pageId).slice(0, 120);
  const ig = await fetchLinkedInstagram(opts.pageId, page.token);
  const fields = await syncPageSubscription(opts.pageId, page.token, { social: true });

  const data = {
    clientId: opts.clientId,
    platform: "facebook",
    pageName,
    igUserId: ig?.id ?? null,
    igUsername: ig?.username ?? null,
    pageTokenEnc: sealSecret(page.token, "social-page-token"),
    tokenValid: true,
    active: true,
    lastError: null,
    connectedById: opts.userId ?? null,
  };
  const account = existing
    ? await prisma.socialAccount.update({ where: { id: existing.id }, data })
    : await prisma.socialAccount.create({ data: { ...data, pageId: opts.pageId } });

  return { accountId: account.id, pageName, igLinked: Boolean(ig), fields };
}

/**
 * ניתוק מהתיבה: הרשומה מכובה (לא נמחקת — השרשורים נשארים), ורישום הוובהוק
 * מסונכרן מחדש בלי השדות החברתיים (leadgen נשאר אם הדף מחובר ללידים).
 * כשל ב-Graph לא חוסם את הניתוק — נרשם בלוג; הקליטה ממילא מתעלמת מדף כבוי.
 */
export async function disconnectSocialAccount(id: string): Promise<void> {
  const account = await prisma.socialAccount.findUnique({ where: { id } });
  if (!account) throw new ApiError(404, "החיבור לא נמצא");
  let token: string | null = null;
  try {
    token = openSecret(account.pageTokenEnc, "social-page-token");
  } catch {
    token = null;
  }
  if (token) {
    await syncPageSubscription(account.pageId, token, { social: false }).catch((err) => {
      console.error("[social disconnect] subscription sync failed", account.pageId, String(err).slice(0, 200));
    });
  }
  await prisma.socialAccount.update({ where: { id }, data: { active: false } });
}
