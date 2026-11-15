/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// בדיקות ללא שרת לשליחה מהתיבה (שלב 1c ידני) — Graph מדומה, DB מקומי:
//   • בניית הקריאה לכל סוג (תגובת FB / תגובת IG / DM) ופענוח התשובה
//   • הגנות: כיבוי גלובלי, טקסט ריק/ארוך, חלון 24 שעות, אי-כפילות, נעילה,
//     תקרת קצב, שגיאת טוקן → tokenValid=false, שגיאת Meta → ללא שינוי
//   • הצלחה: הודעת out עם מזהה Meta, סטטוס answered, טיוטה נמחקת, הד מהוובהוק
//     על אותו מזהה נחשב כפילות
//   npx tsx scripts/social-send-test.ts
// ---------------------------------------------------------------------------
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { sealSecret } from "../src/lib/secretBox";
import {
  buildSendRequest,
  parseSendResponse,
  classifyMetaError,
  sendSocialReply,
  SEND_MAX_CHARS,
  SEND_RATE_PER_MINUTE,
} from "../src/lib/social/send";
import { ingestSocialEvents } from "../src/lib/social/ingest";

const prisma = new PrismaClient();
let fails = 0;
const check = (n: string, ok: boolean, info?: unknown) => {
  console.log(`${ok ? "OK " : "FAIL"} ${n}${ok ? "" : " -> " + JSON.stringify(info)}`);
  if (!ok) fails++;
};

// --- Graph מדומה -----------------------------------------------------------------
const calls: { url: string; body: Record<string, string> }[] = [];
let nextResponse: { ok: boolean; body: any } = { ok: true, body: { id: "sent_1" } };
let counter = 0;
(globalThis as any).fetch = async (url: string, init?: any) => {
  const body: Record<string, string> = {};
  if (init?.body instanceof URLSearchParams) for (const [k, v] of init.body.entries()) body[k] = v;
  calls.push({ url: String(url), body });
  const r = nextResponse;
  if (r.ok && r.body?.id === "auto") return { ok: true, json: async () => ({ id: `sent_${++counter}` }) } as any;
  return { ok: r.ok, json: async () => r.body } as any;
};
const last = () => calls[calls.length - 1];

const PAGE = "900000000000777";
const TOKEN = "PAGE-TOKEN-SEND-TEST";

async function main() {
  process.env.SOCIAL_NAME_LOOKUP = "off";
  process.env.SOCIAL_DRAFTS = "off";
  delete process.env.SOCIAL_SEND;

  // --- יחידות טהורות ---
  const fb = buildSendRequest({ platform: "facebook", kind: "comment", threadExternalId: "c_root", pageId: PAGE, text: "היי", token: TOKEN });
  check("FB comment → POST /{root}/comments {message}", fb.url.endsWith("/c_root/comments") && fb.body.get("message") === "היי" && fb.body.get("access_token") === TOKEN, fb.url);
  const ig = buildSendRequest({ platform: "instagram", kind: "comment", threadExternalId: "igc_1", pageId: PAGE, text: "תודה", token: TOKEN });
  check("IG comment → POST /{comment}/replies", ig.url.endsWith("/igc_1/replies") && ig.body.get("message") === "תודה", ig.url);
  const dm = buildSendRequest({ platform: "facebook", kind: "dm", threadExternalId: "psid_9", pageId: PAGE, text: "שלום", token: TOKEN });
  check(
    "DM → POST /{page}/messages recipient+RESPONSE",
    dm.url.endsWith(`/${PAGE}/messages`) &&
      JSON.parse(dm.body.get("recipient")!).id === "psid_9" &&
      dm.body.get("messaging_type") === "RESPONSE" &&
      JSON.parse(dm.body.get("message")!).text === "שלום",
    dm
  );
  const igdm = buildSendRequest({ platform: "instagram", kind: "dm", threadExternalId: "igsid_3", pageId: PAGE, text: "x", token: TOKEN });
  check("IG DM → גם דרך /{page}/messages (FB Login flow)", igdm.url.endsWith(`/${PAGE}/messages`));
  check("parse: comment id", parseSendResponse({ id: "123_456" }) === "123_456");
  check("parse: message_id", parseSendResponse({ recipient_id: "1", message_id: "m_abc" }) === "m_abc");
  check("parse: ריק → null", parseSendResponse({}) === null);
  check("classify #190 → token", classifyMetaError({ code: 190, message: "expired" }).code === "token");
  check("classify #4 → rate_limited", classifyMetaError({ code: 4, message: "limit" }).code === "rate_limited");
  check("classify #100 → meta_error", classifyMetaError({ code: 100, message: "bad" }).code === "meta_error");

  // --- DB: לקוח + חשבון + שרשורים ---
  const client = await prisma.client.create({ data: { name: "אפולו (בדיקת שליחה)" } });
  const account = await prisma.socialAccount.create({
    data: {
      clientId: client.id,
      platform: "facebook",
      pageId: PAGE,
      pageName: "דף בדיקה",
      igUserId: "ig_send_1",
      pageTokenEnc: sealSecret(TOKEN, "social-page-token"),
      tokenValid: true,
      active: true,
    },
  });
  const now = new Date();
  const mk = (kind: string, platform: string, externalId: string, lastInboundAt: Date, extra: any = {}) =>
    prisma.socialThread.create({
      data: {
        accountId: account.id,
        clientId: client.id,
        platform,
        kind,
        externalId,
        status: "open",
        draftText: "טיוטה",
        draftAt: now,
        lastInboundAt,
        lastMessageAt: lastInboundAt,
        authorExtId: "u1",
        authorName: "גולש",
        ...extra,
      },
    });
  const tComment = await mk("comment", "facebook", "c_root_1", now, { postId: "p1" });
  const tDm = await mk("dm", "facebook", "psid_1", now);
  const tOldDm = await mk("dm", "facebook", "psid_old", new Date(now.getTime() - 25 * 3600 * 1000));
  const tIg = await mk("comment", "instagram", "igc_9", now);

  try {
    // --- הגנות ---
    process.env.SOCIAL_SEND = "off";
    let r = await sendSocialReply({ threadId: tComment.id, text: "x" });
    check("SOCIAL_SEND=off → disabled, בלי קריאה ל-Graph", !r.ok && r.code === "disabled" && calls.length === 0, r);
    delete process.env.SOCIAL_SEND;

    r = await sendSocialReply({ threadId: tComment.id, text: "   " });
    check("טקסט ריק → empty", !r.ok && r.code === "empty", r);
    r = await sendSocialReply({ threadId: tComment.id, text: "א".repeat(SEND_MAX_CHARS + 1) });
    check("ארוך מדי → too_long", !r.ok && r.code === "too_long", r);
    r = await sendSocialReply({ threadId: "nope", text: "x" });
    check("שרשור לא קיים → not_found", !r.ok && r.code === "not_found", r);
    r = await sendSocialReply({ threadId: tOldDm.id, text: "x" });
    check("DM אחרי 24 שעות → window_expired בלי Graph", !r.ok && r.code === "window_expired" && calls.length === 0, r);

    // --- הצלחה: תגובת FB ---
    nextResponse = { ok: true, body: { id: "c_root_1_reply" } };
    r = await sendSocialReply({ threadId: tComment.id, text: "תודה רבה! נחזור אליך", userName: "דנה" });
    check("שליחת תגובה → ok + externalId של Meta", r.ok && r.externalId === "c_root_1_reply", r);
    check("Graph נקרא פעם אחת לנתיב הנכון", calls.length === 1 && last().url.endsWith("/c_root_1/comments") && last().body.message === "תודה רבה! נחזור אליך", last());
    let th = await prisma.socialThread.findUnique({ where: { id: tComment.id }, include: { messages: true } });
    check("סטטוס answered, טיוטה נמחקה", th?.status === "answered" && th.draftText === null && th.draftAt === null, th);
    const out = th!.messages.find((m) => m.direction === "out");
    check("הודעת out נשמרה עם מזהה Meta ושם הדף+השולח", out?.externalId === "c_root_1_reply" && out.authorName === "דף בדיקה · דנה" && Boolean(out.sentAt), out);
    check("אין שורת pending שנשארה", !th!.messages.some((m) => m.externalId?.startsWith("pending:")), th!.messages);

    // --- אי-כפילות: אותו טקסט שוב מיד ---
    r = await sendSocialReply({ threadId: tComment.id, text: "תודה רבה! נחזור אליך" });
    check("אותו טקסט שוב בתוך דקה → duplicate, בלי Graph", !r.ok && r.code === "duplicate" && calls.length === 1, r);

    // --- הד מהוובהוק על אותו מזהה → כפילות (סינון-הד) ---
    const before = await prisma.socialMessage.count({ where: { threadId: tComment.id } });
    const sum = await ingestSocialEvents({
      object: "page",
      entry: [
        {
          id: PAGE,
          time: Date.now(),
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                comment_id: "c_root_1_reply",
                parent_id: "c_root_1",
                post_id: "p1",
                message: "תודה רבה! נחזור אליך",
                from: { id: PAGE, name: "דף בדיקה" },
                created_time: Math.floor(Date.now() / 1000),
              },
            },
          ],
        },
      ],
    });
    const after = await prisma.socialMessage.count({ where: { threadId: tComment.id } });
    check("הד של התגובה שלנו → duplicates, לא הודעה נוספת", sum.duplicates === 1 && after === before, sum);

    // --- DM: הצלחה דרך /messages ---
    nextResponse = { ok: true, body: { recipient_id: "psid_1", message_id: "m_1" } };
    r = await sendSocialReply({ threadId: tDm.id, text: "שלום! איך אפשר לעזור?" });
    check("DM → ok עם message_id", r.ok && r.externalId === "m_1" && last().url.endsWith(`/${PAGE}/messages`), r);

    // --- IG comment → /replies ---
    nextResponse = { ok: true, body: { id: "igc_9_r" } };
    r = await sendSocialReply({ threadId: tIg.id, text: "תודה!" });
    check("IG comment → /replies", r.ok && last().url.endsWith("/igc_9/replies"), last());

    // --- נעילה: שורת pending טרייה חוסמת ---
    const tLock = await mk("comment", "facebook", "c_lock", now);
    await prisma.socialMessage.create({
      data: { threadId: tLock.id, direction: "out", externalId: `pending:${tLock.id}`, text: "בתהליך" },
    });
    const callsBefore = calls.length;
    r = await sendSocialReply({ threadId: tLock.id, text: "אחר" });
    check("נעילה טרייה → in_progress בלי Graph", !r.ok && r.code === "in_progress" && calls.length === callsBefore, r);

    // --- שגיאת Meta רגילה: ללא שינוי, הנעילה משתחררת ---
    const tErr = await mk("comment", "facebook", "c_err", now);
    nextResponse = { ok: false, body: { error: { code: 100, message: "Invalid parameter" } } };
    r = await sendSocialReply({ threadId: tErr.id, text: "x" });
    th = await prisma.socialThread.findUnique({ where: { id: tErr.id }, include: { messages: true } });
    check("שגיאת Meta → meta_error, סטטוס נשאר open, בלי שורת out", !r.ok && r.code === "meta_error" && th?.status === "open" && th.messages.length === 0, { r, th });
    const acc1 = await prisma.socialAccount.findUnique({ where: { id: account.id } });
    check("שגיאה רגילה לא מפילה את tokenValid", acc1?.tokenValid === true, acc1);

    // --- שגיאת טוקן → tokenValid=false + lastError ---
    nextResponse = { ok: false, body: { error: { code: 190, message: "Error validating access token" } } };
    r = await sendSocialReply({ threadId: tErr.id, text: "y" });
    const acc2 = await prisma.socialAccount.findUnique({ where: { id: account.id } });
    check("#190 → token, tokenValid=false, lastError", !r.ok && r.code === "token" && acc2?.tokenValid === false && Boolean(acc2?.lastError), { r, acc2 });
    r = await sendSocialReply({ threadId: tErr.id, text: "z" });
    check("אחרי נפילת טוקן → נחסם מקומית בלי Graph", !r.ok && r.code === "token", r);
    await prisma.socialAccount.update({ where: { id: account.id }, data: { tokenValid: true, lastError: null } });

    // --- תקרת קצב לדף ---
    nextResponse = { ok: true, body: { id: "auto" } };
    const priorOut = await prisma.socialMessage.count({
      where: { direction: "out", createdAt: { gt: new Date(Date.now() - 60_000) }, thread: { accountId: account.id } },
    });
    const rateThreads = [];
    for (let i = 0; i < SEND_RATE_PER_MINUTE; i++) rateThreads.push(await mk("comment", "facebook", `c_rate_${i}`, now));
    let okCount = 0;
    for (const t of rateThreads) {
      const rr = await sendSocialReply({ threadId: t.id, text: `תשובה ${t.externalId}` });
      if (rr.ok) okCount++;
    }
    const tOver = await mk("comment", "facebook", "c_over", now);
    r = await sendSocialReply({ threadId: tOver.id, text: "עוד אחת" });
    check(
      `תקרת קצב לדף: ${SEND_RATE_PER_MINUTE} בדקה (כולל ${priorOut} קודמות), הבאה נחסמת`,
      okCount === SEND_RATE_PER_MINUTE - priorOut && !r.ok && r.code === "rate_limited",
      { okCount, priorOut, r }
    );
  } finally {
    await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
