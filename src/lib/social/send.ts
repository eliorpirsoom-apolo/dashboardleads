// ---------------------------------------------------------------------------
// תיבת מענה חברתי — שליחת תשובה (שלב 1c, ידני בלבד).
//
// כל שליחה מתחילה בלחיצה של אדם בתיבה (SOCIAL_INBOX_PLAN.md §6): המשתמש עורך
// את הטיוטה (או כותב בעצמו) ולוחץ "שלח". אין שליחה אוטומטית ואין תור.
//
// הגנות חובה (§6) שממומשות כאן:
//   • אי-כפילות — נעילה ברמת השרשור (שורת out "pending") + דחיית שליחה זהה בטווח
//     קצר; לחיצה כפולה/retry לא שולחים פעמיים.
//   • סינון-הד — ההודעה שלנו נשמרת עם externalId של Meta, כך שההד מהוובהוק
//     (is_echo / תגובת הדף) נופל על ה-unique ונחשב כפילות.
//   • חלון 24 שעות — DM במסנג׳ר/אינסטגרם מחוץ לחלון מההודעה האחרונה של הגולש
//     נחסם לפני הקריאה ל-Graph (Meta הייתה דוחה אותה ממילא).
//   • תקרת קצב לדף — מספר שליחות לדקה; חריגה → שגיאה ברורה (לא תור).
//   • ניטור תוקף טוקן — שגיאת הרשאה/טוקן → tokenValid=false + lastError, כך
//     שהכרטיס בהגדרות הלקוח ומערכת הבריאות רואים את זה.
//   • כיבוי מיידי — SOCIAL_SEND=off חוסם כל שליחה (מתג חירום גלובלי).
//
// Graph (Page Access Token, FB Login flow):
//   תגובת FB  → POST /{root_comment_id}/comments {message}
//   תגובת IG  → POST /{ig_comment_id}/replies {message}
//   DM (FB/IG)→ POST /{pageId}/messages {recipient:{id}, messaging_type:RESPONSE, message:{text}}
// ---------------------------------------------------------------------------
import { prisma } from "@/lib/prisma";
import { openSecret } from "@/lib/secretBox";
import { GRAPH } from "@/lib/integrations/metaLeads";

export const SEND_MAX_CHARS = 1800; // מתחת למגבלות Meta (Messenger 2000, IG 2200)
export const DM_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SEND_RATE_PER_MINUTE = 10; // לדף
const DUPLICATE_WINDOW_MS = 60_000; // אותו טקסט לאותו שרשור בתוך דקה = לחיצה כפולה
const PENDING_STALE_MS = 2 * 60_000; // נעילה שנתקעה (קריסה באמצע) משתחררת אחרי 2 דק׳
const GRAPH_TIMEOUT_MS = 15_000;

export type SendResult =
  | { ok: true; messageId: string; externalId: string }
  | { ok: false; code: SendErrorCode; message: string };

export type SendErrorCode =
  | "disabled"
  | "not_found"
  | "account_inactive"
  | "token"
  | "empty"
  | "too_long"
  | "window_expired"
  | "rate_limited"
  | "duplicate"
  | "in_progress"
  | "meta_error";

export function sendEnabled(): boolean {
  return process.env.SOCIAL_SEND !== "off";
}

/** קודי Graph שמעידים על טוקן/הרשאה לא תקפים (לא על תוכן). */
const TOKEN_ERROR_CODES = new Set([190, 102, 10, 200, 230]);
/** קודים שמעידים על הגבלת קצב/חסימה זמנית מצד Meta — נרשמים ב-lastError. */
const THROTTLE_ERROR_CODES = new Set([4, 17, 32, 613, 368, 80001, 80002, 80006]);

export function classifyMetaError(err: any): { code: SendErrorCode; message: string } {
  const c = Number(err?.code ?? 0);
  const msg = String(err?.message ?? "שגיאה לא ידועה מ-Meta").slice(0, 300);
  if (TOKEN_ERROR_CODES.has(c)) return { code: "token", message: `הטוקן של הדף לא תקף (${c}) — יש לחבר מחדש: ${msg}` };
  if (THROTTLE_ERROR_CODES.has(c)) return { code: "rate_limited", message: `Meta הגבילה את הדף זמנית (${c}): ${msg}` };
  // #10903 / #2018278: מחוץ לחלון 24 שעות
  if (c === 10 && /24|window|outside/i.test(msg)) return { code: "window_expired", message: msg };
  return { code: "meta_error", message: `Meta דחתה את השליחה (${c}): ${msg}` };
}

interface SendTarget {
  url: string;
  body: URLSearchParams;
}

/** בונה את קריאת ה-Graph לפי סוג השרשור. מיוצא לבדיקות (ללא רשת). */
export function buildSendRequest(opts: {
  platform: string;
  kind: string;
  threadExternalId: string; // תגובה: מזהה תגובת השורש; DM: PSID/IGSID
  pageId: string;
  text: string;
  token: string;
}): SendTarget {
  const { platform, kind, threadExternalId, pageId, text, token } = opts;
  if (kind === "dm") {
    const body = new URLSearchParams({
      recipient: JSON.stringify({ id: threadExternalId }),
      messaging_type: "RESPONSE",
      message: JSON.stringify({ text }),
      access_token: token,
    });
    return { url: `${GRAPH}/${encodeURIComponent(pageId)}/messages`, body };
  }
  const edge = platform === "instagram" ? "replies" : "comments";
  const body = new URLSearchParams({ message: text, access_token: token });
  return { url: `${GRAPH}/${encodeURIComponent(threadExternalId)}/${edge}`, body };
}

/** מפרש את תשובת Graph למזהה חיצוני (תגובה: id; DM: message_id). */
export function parseSendResponse(data: any): string | null {
  const id = data?.message_id ?? data?.id;
  return id ? String(id) : null;
}

async function graphPost(target: SendTarget): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(target.url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: target.body,
    cache: "no-store",
    signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, data };
}

/**
 * שליחת תשובה לשרשור. `userId` — מי לחץ "שלח" (נשמר כ-authorName של ההודעה
 * היוצאת לצד שם הדף). מחזיר תוצאה מובנית; לא זורק על כשלי Meta.
 */
export async function sendSocialReply(opts: {
  threadId: string;
  text: string;
  userId?: string | null;
  userName?: string | null;
}): Promise<SendResult> {
  if (!sendEnabled()) return { ok: false, code: "disabled", message: "השליחה מהתיבה כבויה (SOCIAL_SEND=off)" };

  const text = opts.text.replace(/\r\n/g, "\n").trim();
  if (!text) return { ok: false, code: "empty", message: "אין טקסט לשליחה" };
  if (text.length > SEND_MAX_CHARS) {
    return { ok: false, code: "too_long", message: `התשובה ארוכה מדי (${text.length} תווים, המקסימום ${SEND_MAX_CHARS})` };
  }

  const thread = await prisma.socialThread.findUnique({
    where: { id: opts.threadId },
    select: {
      id: true,
      platform: true,
      kind: true,
      externalId: true,
      lastInboundAt: true,
      account: { select: { id: true, pageId: true, pageName: true, active: true, tokenValid: true, pageTokenEnc: true } },
    },
  });
  if (!thread) return { ok: false, code: "not_found", message: "הפנייה לא נמצאה" };
  const { account } = thread;
  if (!account.active) return { ok: false, code: "account_inactive", message: "הדף נותק מתיבת המענה" };
  if (!account.tokenValid) return { ok: false, code: "token", message: "הטוקן של הדף לא תקף — יש לחבר את הדף מחדש בהגדרות הלקוח" };

  let token: string;
  try {
    token = openSecret(account.pageTokenEnc, "social-page-token");
  } catch {
    return { ok: false, code: "token", message: "הטוקן השמור של הדף לא ניתן לפענוח — יש לנתק ולחבר מחדש" };
  }

  // חלון 24 שעות ל-DM — נמדד מההודעה הנכנסת האחרונה.
  if (thread.kind === "dm") {
    const last = thread.lastInboundAt?.getTime() ?? 0;
    if (Date.now() - last > DM_WINDOW_MS) {
      return {
        ok: false,
        code: "window_expired",
        message: "עברו יותר מ-24 שעות מההודעה האחרונה של הגולש — Meta לא מאפשרת לענות בהודעה פרטית. אפשר לענות מהממשק של פייסבוק/אינסטגרם.",
      };
    }
  }

  const now = Date.now();
  // תקרת קצב לדף (שליחות שהושלמו או בתהליך בדקה האחרונה).
  const recent = await prisma.socialMessage.count({
    where: { direction: "out", createdAt: { gt: new Date(now - 60_000) }, thread: { accountId: account.id } },
  });
  if (recent >= SEND_RATE_PER_MINUTE) {
    return { ok: false, code: "rate_limited", message: `נשלחו כבר ${recent} תשובות מהדף בדקה האחרונה — נסו שוב בעוד רגע` };
  }

  // אי-כפילות: אותו טקסט לאותו שרשור בדקה האחרונה = לחיצה כפולה.
  const dup = await prisma.socialMessage.findFirst({
    where: { threadId: thread.id, direction: "out", text, createdAt: { gt: new Date(now - DUPLICATE_WINDOW_MS) } },
    select: { id: true },
  });
  if (dup) return { ok: false, code: "duplicate", message: "התשובה הזו כבר נשלחה לפני רגע" };

  // נעילה: שורת out "pending" ייחודית לשרשור. אם קיימת נעילה טרייה — שליחה בתהליך.
  const pendingId = `pending:${thread.id}`;
  const pending = await prisma.socialMessage.findUnique({
    where: { threadId_externalId: { threadId: thread.id, externalId: pendingId } },
    select: { id: true, createdAt: true },
  });
  if (pending) {
    if (now - pending.createdAt.getTime() < PENDING_STALE_MS) {
      return { ok: false, code: "in_progress", message: "שליחה לשרשור הזה כבר בתהליך" };
    }
    await prisma.socialMessage.delete({ where: { id: pending.id } }).catch(() => {});
  }
  const authorName = [account.pageName, opts.userName].filter(Boolean).join(" · ") || account.pageName;
  let lock: { id: string };
  try {
    lock = await prisma.socialMessage.create({
      data: { threadId: thread.id, direction: "out", externalId: pendingId, text, authorName, authorExtId: account.pageId },
      select: { id: true },
    });
  } catch {
    return { ok: false, code: "in_progress", message: "שליחה לשרשור הזה כבר בתהליך" };
  }

  const target = buildSendRequest({
    platform: thread.platform,
    kind: thread.kind,
    threadExternalId: thread.externalId,
    pageId: account.pageId,
    text,
    token,
  });

  let res: { ok: boolean; data: any };
  try {
    res = await graphPost(target);
  } catch (e: any) {
    await prisma.socialMessage.delete({ where: { id: lock.id } }).catch(() => {});
    return { ok: false, code: "meta_error", message: `הקריאה ל-Meta נכשלה: ${String(e?.message ?? e).slice(0, 200)}` };
  }

  const externalId = res.ok ? parseSendResponse(res.data) : null;
  if (!res.ok || !externalId) {
    await prisma.socialMessage.delete({ where: { id: lock.id } }).catch(() => {});
    const err = classifyMetaError(res.data?.error ?? { message: JSON.stringify(res.data).slice(0, 200) });
    if (err.code === "token") {
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { tokenValid: false, lastError: err.message.slice(0, 500) },
      });
    } else if (err.code === "rate_limited") {
      await prisma.socialAccount.update({ where: { id: account.id }, data: { lastError: err.message.slice(0, 500) } });
    }
    return { ok: false, code: err.code, message: err.message };
  }

  // הצלחה: ההודעה היוצאת מקבלת את מזהה Meta (ההד מהוובהוק ייפול על ה-unique),
  // השרשור נסגר כ"נענה" והטיוטה מתנקה. אם ההד כבר הקדים אותנו — מוחקים את הנעילה.
  const sentAt = new Date();
  try {
    await prisma.socialMessage.update({ where: { id: lock.id }, data: { externalId, sentAt } });
  } catch {
    await prisma.socialMessage.delete({ where: { id: lock.id } }).catch(() => {});
  }
  await prisma.socialThread.update({
    where: { id: thread.id },
    data: { status: "answered", draftText: null, draftAt: null, draftError: null, lastMessageAt: sentAt },
  });
  await prisma.socialAccount.update({ where: { id: account.id }, data: { lastError: null } }).catch(() => {});
  return { ok: true, messageId: lock.id, externalId };
}
