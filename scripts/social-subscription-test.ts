/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// בדיקות ללא שרת לתיבת המענה החברתי (Graph מדומה, DB מקומי):
//   • state חתום של OAuth (purpose, פורמט ישן, זיוף)
//   • איחוד שדות הרישום לוובהוק (leadgen + feed/messages)
//   • חיבור/ניתוק/חיבור-מחדש של SocialAccount (409, הצפנת טוקן, IG מקושר)
//   npx tsx scripts/social-subscription-test.ts
// ---------------------------------------------------------------------------
import "dotenv/config";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { packMetaState, unpackMetaState, syncPageSubscription } from "../src/lib/integrations/metaLeads";
import { connectSocialAccount, disconnectSocialAccount, refreshInstagramLink } from "../src/lib/social/accounts";
import { sealSecret, openSecret } from "../src/lib/secretBox";

const prisma = new PrismaClient();
let fails = 0;
const check = (n: string, ok: boolean, info?: unknown) => {
  console.log(`${ok ? "OK " : "FAIL"} ${n}${ok ? "" : " -> " + JSON.stringify(info)}`);
  if (!ok) fails++;
};

// --- Graph מדומה: עונה לפי הנתיב/השדות; רושם כל קריאה ---------------------------
const calls: { method: string; url: string; fields?: string }[] = [];
let igResponse: any = { instagram_business_account: { id: "ig_1", username: "apollo_ig" } };
const json = (body: any, ok = true) => ({ ok, json: async () => body }) as any;
(globalThis as any).fetch = async (url: string, init?: any) => {
  const u = String(url);
  const path = u.split("?")[0];
  const method = init?.method ?? "GET";
  const fields = init?.body instanceof URLSearchParams ? init.body.get("subscribed_fields") ?? undefined : undefined;
  calls.push({ method, url: path, fields });
  if (u.includes("fields=access_token,name")) {
    return json({ access_token: `PAGE-TOKEN-${path.split("/").pop()}`, name: "Stub Page" });
  }
  if (u.includes("instagram_business_account")) return json(igResponse);
  return json({ success: true });
};
const last = () => calls[calls.length - 1];

async function main() {
  // --- state ---
  const s1 = packMetaState("c1", "", "social");
  check(
    "state social round-trip",
    JSON.stringify(unpackMetaState(s1)) === JSON.stringify({ clientId: "c1", projectId: "", purpose: "social" }),
    unpackMetaState(s1)
  );
  const s2 = packMetaState("c1", "p1");
  check("state default purpose=leads", unpackMetaState(s2)?.purpose === "leads");
  const SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-change-me-in-production";
  const payload = `c1.p1.${Date.now()}`;
  const oldState = Buffer.from(
    `${payload}.${crypto.createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 24)}`
  ).toString("base64url");
  check(
    "old 4-part state still accepted as leads",
    JSON.stringify(unpackMetaState(oldState)) === JSON.stringify({ clientId: "c1", projectId: "p1", purpose: "leads" }),
    unpackMetaState(oldState)
  );
  const tampered = Buffer.from(
    Buffer.from(s1, "base64url").toString("utf8").replace("social", "leads!")
  ).toString("base64url");
  check("tampered state rejected", unpackMetaState(tampered) === null);
  check("garbage rejected", unpackMetaState("zzz") === null);

  // --- subscription union ---
  const PAGE = "900000000000099";
  const client = await prisma.client.upsert({ where: { name: "sub-test" }, create: { name: "sub-test" }, update: {} });
  const clientB = await prisma.client.upsert({ where: { name: "sub-test-b" }, create: { name: "sub-test-b" }, update: {} });
  await prisma.socialAccount.deleteMany({ where: { pageId: { in: [PAGE, PAGE + "1", PAGE + "2"] } } });
  await prisma.metaPage.deleteMany({ where: { pageId: PAGE } });

  let f = await syncPageSubscription(PAGE, "tok");
  check("nothing connected -> unsubscribe (DELETE)", f.length === 0 && last()?.method === "DELETE", last());
  f = await syncPageSubscription(PAGE, "tok", { social: true });
  check("social only -> feed,messages,messaging_postbacks", f.join(",") === "feed,messages,messaging_postbacks", f);
  f = await syncPageSubscription(PAGE, "tok", { leads: true });
  check("leads only -> leadgen", f.join(",") === "leadgen", f);
  await prisma.socialAccount.create({
    data: { clientId: client.id, pageId: PAGE, pageName: "x", pageTokenEnc: sealSecret("t", "social-page-token") },
  });
  f = await syncPageSubscription(PAGE, "tok", { leads: true });
  check(
    "leads attach while social active -> union incl. leadgen",
    f.join(",") === "leadgen,feed,messages,messaging_postbacks" && last()?.fields === "leadgen,feed,messages,messaging_postbacks",
    { f, last: last() }
  );
  f = await syncPageSubscription(PAGE, "tok", { leads: false });
  check("leads disconnect while social active -> social fields kept", f.join(",") === "feed,messages,messaging_postbacks", f);
  f = await syncPageSubscription(PAGE, "tok", { social: false });
  check("social disconnect, no leads -> unsubscribe", f.length === 0 && last()?.method === "DELETE", last());
  await prisma.socialAccount.deleteMany({ where: { pageId: PAGE } });

  // --- connect / disconnect / reconnect ---
  const P2 = PAGE + "1";
  const r1 = await connectSocialAccount({ clientId: client.id, pageId: P2, userToken: "user-tok", userId: "u1" });
  const acc1 = await prisma.socialAccount.findUnique({ where: { pageId: P2 } });
  check("connect -> account active with page name from Graph", acc1?.active === true && acc1?.pageName === "Stub Page", acc1);
  check("connect -> token sealed and decryptable", acc1 ? openSecret(acc1.pageTokenEnc, "social-page-token") === `PAGE-TOKEN-${P2}` : false);
  check("connect -> token not stored in plain text", acc1 ? !acc1.pageTokenEnc.includes("PAGE-TOKEN") : false);
  check("connect -> IG linked", acc1?.igUserId === "ig_1" && acc1?.igUsername === "apollo_ig" && r1.igLinked, acc1);
  check("connect -> subscribed to social fields", r1.fields.join(",") === "feed,messages,messaging_postbacks", r1.fields);

  let threw: any = null;
  try { await connectSocialAccount({ clientId: client.id, pageId: P2, userToken: "user-tok" }); } catch (e) { threw = e; }
  check("connect again (same client) -> 409", threw?.status === 409, threw?.message);
  threw = null;
  try { await connectSocialAccount({ clientId: clientB.id, pageId: P2, userToken: "user-tok" }); } catch (e) { threw = e; }
  check("connect for another client while active -> 409", threw?.status === 409, threw?.message);

  await disconnectSocialAccount(acc1!.id);
  const acc1b = await prisma.socialAccount.findUnique({ where: { pageId: P2 } });
  check("disconnect -> inactive, row kept", acc1b?.active === false && acc1b?.id === acc1?.id, acc1b);
  check("disconnect -> unsubscribed (no leads on page)", last()?.method === "DELETE", last());

  threw = null;
  try { await connectSocialAccount({ clientId: clientB.id, pageId: P2, userToken: "user-tok" }); } catch (e) { threw = e; }
  check("connect for another client while inactive -> 409", threw?.status === 409, threw?.message);

  await connectSocialAccount({ clientId: client.id, pageId: P2, userToken: "user-tok" });
  const acc1c = await prisma.socialAccount.findUnique({ where: { pageId: P2 } });
  check("reconnect (same client) -> same row reactivated", acc1c?.active === true && acc1c?.id === acc1?.id && acc1c?.lastError === null, acc1c);

  // --- IG missing at connect, linked later -> refresh ---
  const P3 = PAGE + "2";
  igResponse = {};
  const r3 = await connectSocialAccount({ clientId: client.id, pageId: P3, userToken: "user-tok" });
  const acc3 = await prisma.socialAccount.findUnique({ where: { pageId: P3 } });
  check("connect without IG -> igUserId null, igLinked=false", acc3?.igUserId === null && !r3.igLinked, acc3);
  let rr = await refreshInstagramLink(acc3!.id);
  check("refresh IG (still none) -> igLinked=false, nothing changed", !rr.igLinked && (await prisma.socialAccount.findUnique({ where: { id: acc3!.id } }))?.igUserId === null);
  igResponse = { instagram_business_account: { id: "ig_3", username: "late_ig" } };
  rr = await refreshInstagramLink(acc3!.id);
  const acc3b = await prisma.socialAccount.findUnique({ where: { id: acc3!.id } });
  check("refresh IG (linked later) -> igUserId updated", rr.igLinked && acc3b?.igUserId === "ig_3" && acc3b?.igUsername === "late_ig", acc3b);
  check("no Graph write methods used by connect/refresh (only POST subscribed_apps / DELETE)",
    calls.every((c) => c.method === "GET" || c.url.endsWith("/subscribed_apps")), calls.filter((c) => c.method !== "GET" && !c.url.endsWith("/subscribed_apps")));

  // --- ניקוי ---
  await prisma.socialAccount.deleteMany({ where: { pageId: { in: [PAGE, P2, P3] } } });
  await prisma.client.deleteMany({ where: { id: { in: [client.id, clientB.id] } } });
  await prisma.$disconnect();
  console.log(fails ? `${fails} FAILED` : "ALL PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .then(() => process.exit(fails ? 1 : 0));
