/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// בדיקות ללא שרת: state חתום של OAuth (purpose, פורמט ישן, זיוף) ואיחוד שדות
// הרישום לוובהוק (leadgen + feed/messages) עם Graph מדומה. מריץ מול ה-DB
// המקומי:  npx tsx scripts/social-subscription-test.ts
// ---------------------------------------------------------------------------
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { packMetaState, unpackMetaState, syncPageSubscription } from "../src/lib/integrations/metaLeads";
import { sealSecret } from "../src/lib/secretBox";
import crypto from "crypto";

const prisma = new PrismaClient();
let fails = 0;
const check = (n: string, ok: boolean, info?: unknown) => { console.log(`${ok ? "OK " : "FAIL"} ${n}${ok ? "" : " -> " + JSON.stringify(info)}`); if (!ok) fails++; };

// --- state ---
const s1 = packMetaState("c1", "", "social");
check("state social round-trip", JSON.stringify(unpackMetaState(s1)) === JSON.stringify({ clientId: "c1", projectId: "", purpose: "social" }), unpackMetaState(s1));
const s2 = packMetaState("c1", "p1");
check("state default purpose=leads", unpackMetaState(s2)?.purpose === "leads");
// old 4-part format signed with the same secret
const SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-change-me-in-production";
const payload = `c1.p1.${Date.now()}`;
const oldState = Buffer.from(`${payload}.${crypto.createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 24)}`).toString("base64url");
check("old 4-part state still accepted as leads", JSON.stringify(unpackMetaState(oldState)) === JSON.stringify({ clientId: "c1", projectId: "p1", purpose: "leads" }), unpackMetaState(oldState));
const tampered = Buffer.from(Buffer.from(s1, "base64url").toString("utf8").replace("social", "leads!")).toString("base64url");
check("tampered state rejected", unpackMetaState(tampered) === null);
check("garbage rejected", unpackMetaState("zzz") === null);

// --- subscription union (fetch stubbed) ---
const calls: { method: string; url: string; fields?: string }[] = [];
(globalThis as any).fetch = async (url: string, init?: any) => {
  const fields = init?.body instanceof URLSearchParams ? init.body.get("subscribed_fields") ?? undefined : undefined;
  calls.push({ method: init?.method ?? "GET", url: String(url).split("?")[0], fields });
  return { ok: true, json: async () => ({ success: true }) } as any;
};

async function main() {
const PAGE = "900000000000099";
const client = await prisma.client.upsert({ where: { name: "sub-test" }, create: { name: "sub-test" }, update: {} });
await prisma.socialAccount.deleteMany({ where: { pageId: PAGE } });
await prisma.metaPage.deleteMany({ where: { pageId: PAGE } });

let f = await syncPageSubscription(PAGE, "tok");
check("nothing connected -> unsubscribe (DELETE)", f.length === 0 && calls.at(-1)?.method === "DELETE", calls.at(-1));
f = await syncPageSubscription(PAGE, "tok", { social: true });
check("social only -> feed,messages,messaging_postbacks", f.join(",") === "feed,messages,messaging_postbacks", f);
f = await syncPageSubscription(PAGE, "tok", { leads: true });
check("leads only -> leadgen", f.join(",") === "leadgen", f);
await prisma.socialAccount.create({ data: { clientId: client.id, pageId: PAGE, pageName: "x", pageTokenEnc: sealSecret("t", "social-page-token") } });
f = await syncPageSubscription(PAGE, "tok", { leads: true });
check("leads attach while social active -> union incl. leadgen", f.join(",") === "leadgen,feed,messages,messaging_postbacks" && calls.at(-1)?.fields === "leadgen,feed,messages,messaging_postbacks", { f, last: calls.at(-1) });
f = await syncPageSubscription(PAGE, "tok", { leads: false });
check("leads disconnect while social active -> social fields kept", f.join(",") === "feed,messages,messaging_postbacks", f);
f = await syncPageSubscription(PAGE, "tok", { social: false });
check("social disconnect, no leads -> unsubscribe", f.length === 0 && calls.at(-1)?.method === "DELETE", calls.at(-1));

await prisma.socialAccount.deleteMany({ where: { pageId: PAGE } });
await prisma.client.delete({ where: { id: client.id } });
await prisma.$disconnect();
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); }).then(() => process.exit(fails ? 1 : 0));
