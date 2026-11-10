import { prisma } from "@/lib/prisma";
import { openSecret } from "@/lib/secretBox";

// ---------------------------------------------------------------------------
// תיבת מענה חברתי — קליטת אירועי webhook של Meta (שלב 1a: קריאה בלבד).
//   object="page":      changes[].field="feed"      → תגובות פייסבוק
//                       entry.messaging[]           → מסנג׳ר
//   object="instagram": changes[].field="comments"  → תגובות אינסטגרם
//                       entry.messaging[]           → IG Direct
// כללים:
//   • דף/חשבון בלי SocialAccount פעיל → מתעלמים בשקט (יכול להיות דף לידים).
//   • הד (is_echo / תגובה של הדף עצמו) נשמר כ-"out" רק בשרשור קיים; לא פותח
//     שרשור חדש.
//   • דדופ לפי externalId (comment_id / mid): @@unique בטבלה + תפיסת P2002 —
//     שליחה חוזרת של Meta היא no-op.
//   • אין כאן כתיבה ל-Graph. השליפה היחידה: שם השולח ב-DM (best-effort,
//     timeout קצר, כשל שקט). SOCIAL_NAME_LOOKUP=off מכבה אותה (בדיקות).
// ---------------------------------------------------------------------------

const GRAPH = "https://graph.facebook.com/v21.0";
const NO_TEXT = "[תוכן ללא טקסט]";
const SNIPPET_LEN = 140;
const NAME_LOOKUP_TIMEOUT_MS = 4000;

type Platform = "facebook" | "instagram";
type Kind = "comment" | "dm";
type Direction = "in" | "out";

interface Account {
  id: string;
  clientId: string;
  pageId: string;
  igUserId: string | null;
  pageTokenEnc: string;
}

const ACCOUNT_SELECT = {
  id: true,
  clientId: true,
  pageId: true,
  igUserId: true,
  pageTokenEnc: true,
} as const;

export interface IngestSummary {
  received: number; // אירועים רלוונטיים שנבדקו
  stored: number; // הודעות חדשות שנשמרו
  duplicates: number; // אירוע שכבר נקלט (retry של Meta)
  ignored: number; // דף לא מחובר / סוג אירוע לא נתמך / הד ללא שרשור
  errors: number;
}

interface Inbound {
  account: Account;
  platform: Platform;
  kind: Kind;
  threadExtId: string; // תגובת השורש / PSID|IGSID
  messageExtId: string; // comment_id / mid
  direction: Direction;
  text: string;
  authorExtId: string | null;
  authorName: string | null;
  sentAt: Date | null;
  postId: string | null;
  permalink: string | null;
}

// --- עזרים -------------------------------------------------------------------

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Meta שולחת created_time בשניות (feed) ו-timestamp במילישניות (messaging). */
function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n > 1e12 ? n : n * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

function attachmentLabel(type: unknown): string {
  switch (str(type)) {
    case "image":
      return "תמונה";
    case "video":
      return "וידאו";
    case "audio":
      return "הקלטה";
    case "file":
      return "קובץ";
    default:
      return "קובץ מצורף";
  }
}

/** חיפוש חשבון מחובר, עם קאש לבקשה אחת (webhook יכול לאגד כמה entries). */
function makeLookup() {
  const cache = new Map<string, Promise<Account | null>>();
  const get = (key: string, run: () => Promise<Account | null>) => {
    let p = cache.get(key);
    if (!p) {
      p = run();
      cache.set(key, p);
    }
    return p;
  };
  return {
    byPage: (pageId: string) =>
      get(`p:${pageId}`, () =>
        prisma.socialAccount.findFirst({ where: { pageId, active: true }, select: ACCOUNT_SELECT })
      ),
    byIg: (igUserId: string) =>
      get(`i:${igUserId}`, () =>
        prisma.socialAccount.findFirst({ where: { igUserId, active: true }, select: ACCOUNT_SELECT })
      ),
  };
}

// --- פענוח אירועים ל-Inbound ---------------------------------------------------

/** תגובת פייסבוק (feed, item=comment, verb=add). */
function fromFeedComment(account: Account, v: any): Inbound | null {
  if (!v || v.item !== "comment" || v.verb !== "add") return null;
  const commentId = str(v.comment_id);
  if (!commentId) return null;
  const postId = str(v.post_id);
  const parentId = str(v.parent_id);
  const fromId = str(v.from?.id);
  const isEcho = Boolean(fromId) && fromId === account.pageId;
  // שרשור = תגובת השורש. parent_id של תגובה עליונה שווה ל-post_id.
  const threadExtId = parentId && parentId !== postId ? parentId : commentId;
  // תגובה עליונה של הדף עצמו על הפוסט שלו אינה פנייה.
  if (isEcho && threadExtId === commentId) return null;
  return {
    account,
    platform: "facebook",
    kind: "comment",
    threadExtId,
    messageExtId: commentId,
    direction: isEcho ? "out" : "in",
    text: str(v.message) || NO_TEXT,
    authorExtId: fromId || null,
    authorName: str(v.from?.name) || null,
    sentAt: toDate(v.created_time),
    postId: postId || null,
    permalink: str(v.post?.permalink_url) || null,
  };
}

/** תגובת אינסטגרם (object=instagram, field=comments). */
function fromIgComment(account: Account, v: any): Inbound | null {
  const id = str(v?.id);
  if (!id) return null;
  const fromId = str(v.from?.id);
  const isEcho = Boolean(fromId) && Boolean(account.igUserId) && fromId === account.igUserId;
  const parentId = str(v.parent_id);
  const threadExtId = parentId || id;
  if (isEcho && !parentId) return null;
  return {
    account,
    platform: "instagram",
    kind: "comment",
    threadExtId,
    messageExtId: id,
    direction: isEcho ? "out" : "in",
    text: str(v.text) || NO_TEXT,
    authorExtId: fromId || null,
    authorName: str(v.from?.username) || null,
    sentAt: null, // Meta לא שולחת זמן בתגובות IG — זמן הקליטה
    postId: str(v.media?.id) || null,
    permalink: null,
  };
}

/** הודעת מסנג׳ר / IG Direct (entry.messaging[] עם message). selfId = הדף/חשבון. */
function fromMessaging(account: Account, platform: Platform, selfId: string, ev: any): Inbound | null {
  const m = ev?.message;
  const mid = str(m?.mid);
  if (!mid) return null;
  const senderId = str(ev.sender?.id);
  const isEcho = m.is_echo === true || (Boolean(senderId) && senderId === selfId);
  const peer = isEcho ? str(ev.recipient?.id) : senderId;
  if (!peer) return null;
  let text = str(m.text);
  if (!text) {
    const att = Array.isArray(m.attachments) ? m.attachments : [];
    text = att.length ? `[${attachmentLabel(att[0]?.type)}]` : NO_TEXT;
  }
  return {
    account,
    platform,
    kind: "dm",
    threadExtId: peer,
    messageExtId: mid,
    direction: isEcho ? "out" : "in",
    text,
    authorExtId: isEcho ? selfId : peer,
    authorName: null,
    sentAt: toDate(ev.timestamp),
    postId: null,
    permalink: null,
  };
}

// --- שם השולח (best-effort) -----------------------------------------------------

async function lookupAuthorName(
  account: Account,
  platform: Platform,
  extId: string | null
): Promise<string | null> {
  if (!extId || process.env.SOCIAL_NAME_LOOKUP === "off") return null;
  let token: string;
  try {
    token = openSecret(account.pageTokenEnc, "social-page-token");
  } catch {
    return null;
  }
  const fields = platform === "facebook" ? "name,first_name,last_name" : "name,username";
  try {
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(extId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
      { cache: "no-store", signal: AbortSignal.timeout(NAME_LOOKUP_TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const d: any = await res.json();
    return (
      str(d.name) ||
      [str(d.first_name), str(d.last_name)].filter(Boolean).join(" ") ||
      str(d.username) ||
      null
    );
  } catch {
    return null;
  }
}

// --- שמירה ----------------------------------------------------------------------

const THREAD_SELECT = { id: true, status: true, authorName: true, lastMessageAt: true } as const;

async function store(ib: Inbound): Promise<"stored" | "duplicates" | "ignored"> {
  const { account } = ib;
  const where = {
    accountId_kind_externalId: { accountId: account.id, kind: ib.kind, externalId: ib.threadExtId },
  };
  const when = ib.sentAt ?? new Date();
  const snippet = ib.text.slice(0, SNIPPET_LEN);

  let thread = await prisma.socialThread.findUnique({ where, select: THREAD_SELECT });

  if (!thread) {
    // הד בלי שרשור (הדף כתב ראשון / שיחה ישנה מלפני החיבור) — לא פותחים פנייה.
    if (ib.direction === "out") return "ignored";
    const authorName = ib.authorName ?? (await lookupAuthorName(account, ib.platform, ib.authorExtId));
    try {
      await prisma.socialThread.create({
        data: {
          accountId: account.id,
          clientId: account.clientId,
          platform: ib.platform,
          kind: ib.kind,
          externalId: ib.threadExtId,
          postId: ib.postId,
          permalink: ib.permalink,
          authorName,
          authorExtId: ib.authorExtId,
          status: "open",
          lastInboundAt: when,
          lastMessageAt: when,
          snippet,
          messages: {
            create: {
              direction: ib.direction,
              externalId: ib.messageExtId,
              text: ib.text,
              authorName,
              authorExtId: ib.authorExtId,
              sentAt: ib.sentAt,
            },
          },
        },
      });
      await touchAccount(account);
      return "stored";
    } catch (err) {
      // מרוץ: שתי מסירות של אותו אירוע במקביל — השנייה ממשיכה כשרשור קיים.
      if (!isUniqueViolation(err)) throw err;
      thread = await prisma.socialThread.findUnique({ where, select: THREAD_SELECT });
      if (!thread) throw err;
    }
  }

  try {
    await prisma.socialMessage.create({
      data: {
        threadId: thread.id,
        direction: ib.direction,
        externalId: ib.messageExtId,
        text: ib.text,
        authorName: ib.authorName,
        authorExtId: ib.authorExtId,
        sentAt: ib.sentAt,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return "duplicates";
    throw err;
  }

  const data: {
    lastMessageAt?: Date;
    snippet?: string;
    lastInboundAt?: Date;
    status?: string;
    authorName?: string;
  } = {};
  // אירועים יכולים להגיע שלא לפי הסדר — לא מזיזים את "האחרון" אחורה.
  if (when >= thread.lastMessageAt) {
    data.lastMessageAt = when;
    data.snippet = snippet;
  }
  if (ib.direction === "in") {
    data.lastInboundAt = when;
    // פנייה שטופלה/נדחתה והאדם כתב שוב — חוזרת לתור.
    if (thread.status === "answered" || thread.status === "ignored") data.status = "open";
    if (!thread.authorName && ib.authorName) data.authorName = ib.authorName;
  } else if (thread.status === "open" || thread.status === "drafted") {
    // הדף ענה (מהממשק של פייסבוק/אינסטגרם) — הפנייה נענתה.
    data.status = "answered";
  }
  await prisma.socialThread.update({ where: { id: thread.id }, data });
  await touchAccount(account);
  return "stored";
}

async function touchAccount(account: Account): Promise<void> {
  await prisma.socialAccount
    .update({ where: { id: account.id }, data: { lastEventAt: new Date(), lastError: null } })
    .catch(() => {});
}

async function markError(account: Account, message: string): Promise<void> {
  await prisma.socialAccount
    .update({ where: { id: account.id }, data: { lastError: message.slice(0, 300) } })
    .catch(() => {});
}

// --- נקודת הכניסה ----------------------------------------------------------------

/** עיבוד גוף webhook (אחרי אימות חתימה). לעולם לא זורק על אירוע בודד —
 *  שגיאה נספרת, נרשמת ב-console וב-SocialAccount.lastError, והשאר ממשיכים. */
export async function ingestSocialEvents(body: any): Promise<IngestSummary> {
  const sum: IngestSummary = { received: 0, stored: 0, duplicates: 0, ignored: 0, errors: 0 };
  const object = str(body?.object);
  if (object !== "page" && object !== "instagram") return sum;
  const platform: Platform = object === "page" ? "facebook" : "instagram";
  const lookup = makeLookup();

  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    const entryId = str(entry?.id);
    if (!entryId) continue;
    const account = object === "page" ? await lookup.byPage(entryId) : await lookup.byIg(entryId);
    const items: Inbound[] = [];

    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const field = str(change?.field);
      const relevant =
        (object === "page" && field === "feed") || (object === "instagram" && field === "comments");
      if (!relevant) continue; // leadgen ודומיו מטופלים במקום אחר
      sum.received++;
      if (!account) {
        sum.ignored++;
        continue;
      }
      const ib =
        object === "page" ? fromFeedComment(account, change.value) : fromIgComment(account, change.value);
      if (ib) items.push(ib);
      else sum.ignored++;
    }

    for (const ev of Array.isArray(entry?.messaging) ? entry.messaging : []) {
      if (!ev?.message) continue; // read / delivery / postback / reaction — לא בשלב זה
      sum.received++;
      if (!account) {
        sum.ignored++;
        continue;
      }
      const ib = fromMessaging(account, platform, entryId, ev);
      if (ib) items.push(ib);
      else sum.ignored++;
    }

    for (const ib of items) {
      try {
        sum[await store(ib)]++;
      } catch (err) {
        sum.errors++;
        const msg = str((err as Error)?.message ?? err);
        console.error("[social ingest]", ib.platform, ib.kind, ib.messageExtId, msg.slice(0, 300));
        await markError(ib.account, msg);
      }
    }
  }
  return sum;
}
