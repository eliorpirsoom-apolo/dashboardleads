/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// בדיקות סינתטיות לקליטת תיבת המענה החברתי (שלב 1a) מול שרת מקומי רץ:
//   npx tsx scripts/social-webhook-test.ts [http://localhost:3000] [--keep]
// יוצר לקוח ודף בדיקה ב-DB המקומי, שולח אירועי webhook חתומים (חתימה
// תקינה/שגויה, feed, comments, messaging, is_echo, דדופ) ובודק את הרשומות
// ישירות ב-Prisma. --keep משאיר את נתוני הבדיקה (לצפייה ב-/admin/social).
// דורש META_APP_SECRET ב-.env (ערך דמה מספיק) ו-SOCIAL_NAME_LOOKUP=off.
// ---------------------------------------------------------------------------
import "dotenv/config";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { sealSecret } from "../src/lib/secretBox";

const BASE = (process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3000").replace(/\/$/, "");
const KEEP = process.argv.includes("--keep");
const SECRET = process.env.META_APP_SECRET;
if (!SECRET) {
  console.error("META_APP_SECRET חסר ב-.env (ערך דמה מספיק לבדיקה מקומית)");
  process.exit(2);
}

const prisma = new PrismaClient();
const PAGE = "900000000000001";
const IG = "17840000000000001";
const POST = `${PAGE}_123456`;
const CLIENT_NAME = "אפולו פרסום (בדיקה)";

let failures = 0;
function check(name: string, ok: boolean, info?: unknown) {
  console.log(`${ok ? "✔" : "✘"} ${name}${ok || info === undefined ? "" : `  → ${JSON.stringify(info)}`}`);
  if (!ok) failures++;
}

async function post(body: unknown, signature?: string) {
  const raw = JSON.stringify(body);
  const sig = signature ?? `sha256=${crypto.createHmac("sha256", SECRET!).update(raw).digest("hex")}`;
  const res = await fetch(`${BASE}/api/webhooks/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig },
    body: raw,
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

// --- בוני אירועים ---------------------------------------------------------------
const feed = (pageId: string, v: Record<string, unknown>) => ({
  object: "page",
  entry: [{ id: pageId, time: Date.now(), changes: [{ field: "feed", value: v }] }],
});
const comment = (
  commentId: string,
  from: { id: string; name?: string },
  message: string,
  parentId = POST,
  verb = "add"
) => ({
  item: "comment",
  verb,
  comment_id: commentId,
  post_id: POST,
  parent_id: parentId,
  from,
  message,
  created_time: Math.floor(Date.now() / 1000),
  post: { id: POST, permalink_url: `https://www.facebook.com/${POST}` },
});
const messaging = (
  object: "page" | "instagram",
  selfId: string,
  ev: { sender: string; recipient: string; mid: string; text?: string; is_echo?: boolean; attachments?: unknown[] }
) => ({
  object,
  entry: [
    {
      id: selfId,
      time: Date.now(),
      messaging: [
        {
          sender: { id: ev.sender },
          recipient: { id: ev.recipient },
          timestamp: Date.now(),
          message: {
            mid: ev.mid,
            ...(ev.text !== undefined ? { text: ev.text } : {}),
            ...(ev.is_echo ? { is_echo: true } : {}),
            ...(ev.attachments ? { attachments: ev.attachments } : {}),
          },
        },
      ],
    },
  ],
});
const igComment = (id: string, from: { id: string; username?: string }, text: string, parentId?: string) => ({
  object: "instagram",
  entry: [
    {
      id: IG,
      time: Date.now(),
      changes: [
        {
          field: "comments",
          value: { id, text, from, media: { id: "1784_media_1", media_product_type: "FEED" }, ...(parentId ? { parent_id: parentId } : {}) },
        },
      ],
    },
  ],
});

// --- הכנה -------------------------------------------------------------------------
async function setup() {
  const client = await prisma.client.upsert({
    where: { name: CLIENT_NAME },
    create: { name: CLIENT_NAME, type: "general" },
    update: {},
  });
  await prisma.socialAccount.deleteMany({ where: { pageId: PAGE } });
  // מאגר ידע — כדי שטיוטות (שלב 1b, סטאב) ייווצרו בקליטה.
  await prisma.socialKnowledge.upsert({
    where: { clientId: client.id },
    create: { clientId: client.id, about: "אפולו — סוכנות פרסום", faq: "שעות: 9-18", escalate: "מחיר מיוחד", aiEnabled: true },
    update: { aiEnabled: true, escalate: "מחיר מיוחד" },
  });
  const account = await prisma.socialAccount.create({
    data: {
      clientId: client.id,
      pageId: PAGE,
      pageName: "Apollo (test page)",
      igUserId: IG,
      igUsername: "apollo_test",
      pageTokenEnc: sealSecret("TEST-PAGE-TOKEN-not-real", "social-page-token"),
    },
  });
  return { client, account };
}

async function threads(accountId: string) {
  return prisma.socialThread.findMany({
    where: { accountId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
}

// --- הבדיקות ------------------------------------------------------------------------
async function main() {
  const { account } = await setup();
  const T = () => threads(account.id);

  // 1. חתימה שגויה
  let r = await post(feed(PAGE, comment("c_bad", { id: "u1" }, "hi")), "sha256=" + "0".repeat(64));
  check("חתימה שגויה → 403", r.status === 403, r);
  check("חתימה שגויה → לא נשמר", (await T()).length === 0);

  // 2. תגובת פייסבוק עליונה
  r = await post(feed(PAGE, comment("c1", { id: "u1", name: "דנה כהן" }, "כמה עולה?")));
  let t = await T();
  check("תגובת FB → 200", r.status === 200, r);
  // שלב 1b: עם סטאב AI (SOCIAL_AI_STUB=1 ב-.env של השרת) הפנייה מקבלת טיוטה מיד בקליטה.
  const STUB = process.env.SOCIAL_AI_STUB === "1";
  const afterInbound = STUB ? "drafted" : "open";
  check(`תגובת FB → שרשור אחד (comment/facebook/${afterInbound})`, t.length === 1 && t[0].kind === "comment" && t[0].platform === "facebook" && t[0].status === afterInbound, t.map((x) => [x.kind, x.platform, x.status]));
  check("תגובת FB → טיוטת AI נוצרה בקליטה (סטאב)", !STUB || (Boolean(t[0]?.draftText) && t[0]?.aiCategory === "lead" && r.json?.social?.drafts && Object.values(r.json.social.drafts)[0] === "drafted"), { draft: t[0]?.draftText, drafts: r.json?.social?.drafts });
  check("תגובת FB → externalId = comment_id, postId, permalink, authorName", t[0]?.externalId === "c1" && t[0]?.postId === POST && Boolean(t[0]?.permalink) && t[0]?.authorName === "דנה כהן", t[0]);
  check("תגובת FB → הודעה אחת (in)", t[0]?.messages.length === 1 && t[0]?.messages[0].direction === "in" && t[0]?.messages[0].externalId === "c1");

  // 3. אותו אירוע פעמיים (retry של Meta)
  r = await post(feed(PAGE, comment("c1", { id: "u1", name: "דנה כהן" }, "כמה עולה?")));
  t = await T();
  check("אותו אירוע פעמיים → עדיין הודעה אחת", t.length === 1 && t[0].messages.length === 1, r.json.social);
  check("אותו אירוע פעמיים → נספר כ-duplicate", r.json?.social?.duplicates === 1 && r.json?.social?.stored === 0, r.json.social);

  // 4. תשובת הדף עצמו (הד) בשרשור קיים → out + answered
  r = await post(feed(PAGE, comment("c1_r1", { id: PAGE, name: "Apollo" }, "ההצעה בפרטי", "c1")));
  t = await T();
  check("תשובת הדף → נשמרת כ-out באותו שרשור", t.length === 1 && t[0].messages.length === 2 && t[0].messages[1].direction === "out");
  check("תשובת הדף → סטטוס answered + הטיוטה נמחקה", t[0]?.status === "answered" && t[0]?.draftText === null, [t[0]?.status, t[0]?.draftText]);

  // 5. המשתמש עונה שוב → in, חוזר ל-open
  r = await post(feed(PAGE, comment("c1_r2", { id: "u1", name: "דנה כהן" }, "תודה, ומתי?", "c1")));
  t = await T();
  check(`תשובת משתמש → 3 הודעות, סטטוס חוזר ל-${afterInbound}`, t[0]?.messages.length === 3 && t[0]?.status === afterInbound, [t[0]?.messages.length, t[0]?.status]);

  // 5b. תלונה → דורש אדם בלי טיוטה (מילת הסלמה מובנית "תלונה", עוד לפני AI)
  r = await post(feed(PAGE, comment("c_complaint", { id: "u3", name: "רון" }, "יש לי תלונה על השירות")));
  t = await T();
  const comp = t.find((x) => x.externalId === "c_complaint");
  check("תלונה → needs_human עם סיבה, בלי טיוטה", comp?.status === "needs_human" && comp?.needsHuman === true && Boolean(comp?.reason) && comp?.draftText === null, comp);
  // 5c. מילת הסלמה של הלקוח
  r = await post(feed(PAGE, comment("c_esc", { id: "u4", name: "גל" }, "יש מחיר מיוחד?")));
  t = await T();
  check("מילת הסלמה של הלקוח → needs_human", t.find((x) => x.externalId === "c_esc")?.status === "needs_human");
  check("snippet = ההודעה האחרונה", t[0]?.snippet === "תודה, ומתי?", t[0]?.snippet);

  // 6. verb שאינו add (עריכה) → מתעלמים
  const before6 = (await T()).length;
  r = await post(feed(PAGE, comment("c9", { id: "u1" }, "edited", POST, "edited")));
  check("verb=edited → ignored, בלי רשומה", (await T()).length === before6 && r.json?.social?.ignored === 1, r.json.social);

  // 7. תגובה עליונה של הדף על הפוסט שלו → לא פנייה
  r = await post(feed(PAGE, comment("c_page_top", { id: PAGE, name: "Apollo" }, "פוסט חדש!")));
  check("תגובה עליונה של הדף → לא נפתח שרשור", (await T()).length === before6, r.json.social);

  // 7b. תגובה בלי `from` (Meta השמיטה; השלמה מ-Graph כבויה בבדיקה) → נקלטת כפנייה
  r = await post(feed(PAGE, { ...comment("c_nofrom", { id: "x" }, "בלי מזהה שולח"), from: undefined }));
  t = await T();
  const nf = t.find((x) => x.externalId === "c_nofrom");
  check("תגובה ללא from → נקלטת כ-in עם authorName ריק", Boolean(nf) && nf!.messages[0]?.direction === "in" && nf!.authorName === null, nf);

  // 8. מסנג'ר נכנס
  r = await post(messaging("page", PAGE, { sender: "psid_1", recipient: PAGE, mid: "m1", text: "שלום, יש פגישה?" }));
  t = await T();
  const dm = t.find((x) => x.kind === "dm");
  check("מסנג'ר → שרשור dm/facebook עם externalId=PSID", Boolean(dm) && dm!.platform === "facebook" && dm!.externalId === "psid_1" && dm!.messages.length === 1, dm);

  // 9. הד (הדף ענה במסנג'ר) → out בשרשור הקיים
  r = await post(messaging("page", PAGE, { sender: PAGE, recipient: "psid_1", mid: "m1_echo", text: "בטח!", is_echo: true }));
  t = await T();
  const dm2 = t.find((x) => x.kind === "dm" && x.externalId === "psid_1");
  check("is_echo → out בשרשור הקיים + answered", dm2?.messages.length === 2 && dm2?.messages[1].direction === "out" && dm2?.status === "answered", [dm2?.messages.length, dm2?.status]);

  // 10. הד לאדם ללא שרשור → מתעלמים
  r = await post(messaging("page", PAGE, { sender: PAGE, recipient: "psid_unknown", mid: "m_echo_new", text: "הי", is_echo: true }));
  check("is_echo ללא שרשור → לא נפתח שרשור", !(await T()).some((x) => x.externalId === "psid_unknown") && r.json?.social?.ignored === 1, r.json.social);

  // 11. הודעה עם קובץ בלבד
  r = await post(messaging("page", PAGE, { sender: "psid_2", recipient: PAGE, mid: "m2", attachments: [{ type: "image", payload: { url: "https://x/y.jpg" } }] }));
  t = await T();
  check("הודעת תמונה בלי טקסט → [תמונה]", t.find((x) => x.externalId === "psid_2")?.messages[0]?.text === "[תמונה]");

  // 12. אירוע messaging בלי message (read) → מתעלמים
  r = await post({ object: "page", entry: [{ id: PAGE, time: Date.now(), messaging: [{ sender: { id: "psid_1" }, recipient: { id: PAGE }, timestamp: Date.now(), read: { watermark: 1 } }] }] });
  check("אירוע read → received=0", r.status === 200 && r.json?.social?.received === 0, r.json.social);

  // 13. תגובת אינסטגרם + תשובת החשבון + IG Direct
  r = await post(igComment("ig_c1", { id: "ig_u1", username: "yossi.levi" }, "יש משלוחים?"));
  t = await T();
  const igc = t.find((x) => x.platform === "instagram" && x.kind === "comment");
  check("תגובת IG → שרשור instagram/comment, authorName=username", igc?.externalId === "ig_c1" && igc?.authorName === "yossi.levi" && igc?.postId === "1784_media_1", igc);
  r = await post(igComment("ig_c1_r", { id: IG, username: "apollo_test" }, "כן!", "ig_c1"));
  t = await T();
  check("תשובת חשבון IG → out + answered", t.find((x) => x.externalId === "ig_c1")?.messages.length === 2 && t.find((x) => x.externalId === "ig_c1")?.status === "answered");
  r = await post(messaging("instagram", IG, { sender: "igsid_1", recipient: IG, mid: "ig_m1", text: "היי" }));
  t = await T();
  check("IG Direct → שרשור instagram/dm", t.some((x) => x.platform === "instagram" && x.kind === "dm" && x.externalId === "igsid_1"));

  // 14. דף לא מחובר → 200 בלי רשומה
  const before = (await T()).length;
  r = await post(feed("123", comment("zz", { id: "u1" }, "hello")));
  check("דף לא מחובר → 200, ignored, בלי רשומה", r.status === 200 && r.json?.social?.ignored === 1 && (await T()).length === before, r.json.social);

  // 15. leadgen לא נפגע (דף לא מחובר ללידים → note, בלי קריסה)
  r = await post({ object: "page", entry: [{ id: "123", changes: [{ field: "leadgen", value: { page_id: "123", leadgen_id: "1" } }] }] });
  check("leadgen עדיין מעובד (processed=1)", r.status === 200 && r.json?.processed === 1, r.json);

  // 16. ייחוד שרשורים ומצב החשבון
  const acc = await prisma.socialAccount.findUnique({ where: { id: account.id } });
  check("SocialAccount.lastEventAt עודכן, lastError ריק", Boolean(acc?.lastEventAt) && acc?.lastError === null, acc);
  const all = await T();
  check("סה\"כ שרשורים: 8 (FB comment×4, FB dm×2, IG comment, IG dm)", all.length === 8, all.map((x) => `${x.platform}/${x.kind}/${x.externalId}`));

  console.log(failures ? `\n${failures} בדיקות נכשלו` : "\nכל הבדיקות עברו");
  if (!KEEP) {
    await prisma.socialAccount.deleteMany({ where: { pageId: PAGE } });
    await prisma.client.deleteMany({ where: { name: CLIENT_NAME } });
    console.log("נתוני הבדיקה נמחקו (--keep משאיר אותם)");
  } else {
    console.log(`נתוני הבדיקה נשארו: לקוח "${CLIENT_NAME}", דף ${PAGE}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failures ? 1 : 0);
  });
