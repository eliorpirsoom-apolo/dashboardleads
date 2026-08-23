import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Meta (Facebook Lead Ads) — חיבור ישיר, בלי Lead Manager באמצע:
//   1. וובהוק leadgen: Meta מודיעה בזמן אמת על ליד חדש (רק מזהה).
//   2. משיכת פרטי הליד המלאים מ-Graph API עם טוקן העמוד.
//   3. הזרמה לצינור הקליטה הקיים (/api/intake/<token>) — אותו מנגנון
//      בדיוק כמו טפסים/פייקול: דה-דופ, שיוך אוטומטי, וואטסאפ למשווק, יומן.
// עמודים מחוברים ברמת הלקוח (MetaPage) עם טוקן עמוד ארוך-טווח; כל טופס
// Lead Ads מנותב לפרויקט משלו (routing), וטופס לא-משויך נופל לברירת המחדל
// של החיבור (פרויקט או "ללא" — הלידים נשמרים ללקוח וממתינים לשיוך).
// ---------------------------------------------------------------------------

const GRAPH = "https://graph.facebook.com/v21.0";

const SECRET =
  process.env.AUTH_SECRET || "dev-insecure-secret-change-me-in-production";

export function metaEnabled(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function metaRedirectUri(): string {
  const base = process.env.APP_BASE_URL || "https://app.apolloadv.co.il";
  return `${base.replace(/\/$/, "")}/api/integrations/meta/callback`;
}

/** טוקן האימות של הוובהוק — נגזר מסוד המערכת, בלי env נוסף. */
export function metaVerifyToken(): string {
  return crypto
    .createHmac("sha256", SECRET)
    .update("meta-webhook-verify")
    .digest("hex")
    .slice(0, 32);
}

// --- state / blob חתומים (כמו ב-Google OAuth) -------------------------------

export function packMetaState(clientId: string, projectId: string): string {
  const payload = `${clientId}.${projectId}.${Date.now()}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 24);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function unpackMetaState(
  state: string
): { clientId: string; projectId: string } | null {
  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    const [clientId, projectId, ts, sig] = raw.split(".");
    const payload = `${clientId}.${projectId}.${ts}`;
    const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 24);
    if (sig !== expected) return null;
    if (Date.now() - Number(ts) > 15 * 60 * 1000) return null;
    return { clientId, projectId };
  } catch {
    return null;
  }
}

/** חתימה על טוקן המשתמש בין מסך בחירת העמוד (callback) לחיבור (attach). */
export function signUserToken(token: string): string {
  const payload = `${token}.${Date.now()}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 24);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyUserToken(blob: string): string | null {
  try {
    const raw = Buffer.from(blob, "base64url").toString("utf8");
    const idx = raw.lastIndexOf(".");
    const idx2 = raw.lastIndexOf(".", idx - 1);
    const token = raw.slice(0, idx2);
    const ts = raw.slice(idx2 + 1, idx);
    const sig = raw.slice(idx + 1);
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(`${token}.${ts}`)
      .digest("hex")
      .slice(0, 24);
    if (sig !== expected) return null;
    if (Date.now() - Number(ts) > 15 * 60 * 1000) return null;
    return token;
  } catch {
    return null;
  }
}

/** אימות חתימת וובהוק של Meta (X-Hub-Signature-256). */
export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto
    .createHmac("sha256", process.env.META_APP_SECRET!)
    .update(rawBody)
    .digest("hex");
  const got = header.slice(7);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(got, "hex"));
  } catch {
    return false;
  }
}

// --- Graph API ---------------------------------------------------------------

/** קוד → טוקן משתמש ארוך-טווח (60 יום). */
export async function exchangeCodeForUserToken(code: string): Promise<string> {
  const p1 = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: metaRedirectUri(),
    code,
  });
  const r1 = await fetch(`${GRAPH}/oauth/access_token?${p1}`);
  const d1 = await r1.json();
  if (!r1.ok || !d1.access_token) {
    throw new Error(`החלפת קוד נכשלה: ${JSON.stringify(d1.error ?? d1).slice(0, 200)}`);
  }
  const p2 = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: d1.access_token,
  });
  const r2 = await fetch(`${GRAPH}/oauth/access_token?${p2}`);
  const d2 = await r2.json();
  return d2.access_token ?? d1.access_token;
}

/** העמודים שהמשתמש מנהל. */
export async function listUserPages(
  userToken: string
): Promise<{ id: string; name: string }[]> {
  const out = new Map<string, string>();
  let url = `${GRAPH}/me/accounts?fields=id,name&limit=100&access_token=${encodeURIComponent(userToken)}`;
  for (let i = 0; i < 5 && url; i++) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`שליפת עמודים נכשלה: ${JSON.stringify(data.error ?? data).slice(0, 200)}`);
    }
    for (const p of data.data ?? []) out.set(String(p.id), String(p.name ?? p.id));
    url = data.paging?.next ?? "";
  }
  // דפים בגישה עסקית (שיתוף שותף מתיק של לקוח) לא חוזרים מ-/me/accounts —
  // נאספים דרך התיקים העסקיים. דורש business_management; בהיעדרה — כשל שקט.
  try {
    const bizRes = await fetch(
      `${GRAPH}/me/businesses?fields=id&limit=50&access_token=${encodeURIComponent(userToken)}`
    );
    const bizData = await bizRes.json();
    if (bizRes.ok) {
      for (const b of bizData.data ?? []) {
        for (const edge of ["owned_pages", "client_pages"]) {
          let purl = `${GRAPH}/${b.id}/${edge}?fields=id,name&limit=100&access_token=${encodeURIComponent(userToken)}`;
          for (let i = 0; i < 5 && purl; i++) {
            const res = await fetch(purl);
            const data = await res.json();
            if (!res.ok) break;
            for (const p of data.data ?? []) {
              const id = String(p.id);
              if (!out.has(id)) out.set(id, String(p.name ?? id));
            }
            purl = data.paging?.next ?? "";
          }
        }
      }
    }
  } catch {}
  return [...out].map(([id, name]) => ({ id, name }));
}

/** טוקן עמוד (Page Access Token) — לא פג כשנגזר מטוקן משתמש ארוך-טווח. */
export async function getPageToken(
  pageId: string,
  userToken: string
): Promise<{ token: string; name: string }> {
  const res = await fetch(
    `${GRAPH}/${pageId}?fields=access_token,name&access_token=${encodeURIComponent(userToken)}`
  );
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`שליפת טוקן עמוד נכשלה: ${JSON.stringify(data.error ?? data).slice(0, 200)}`);
  }
  return { token: data.access_token, name: data.name ?? "" };
}

/** רישום האפליקציה לקבלת leadgen מהעמוד. */
export async function subscribePageToLeadgen(pageId: string, pageToken: string): Promise<void> {
  const res = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      subscribed_fields: "leadgen",
      access_token: pageToken,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(`רישום הוובהוק לעמוד נכשל: ${JSON.stringify(data.error ?? data).slice(0, 200)}`);
  }
}

export async function unsubscribePage(pageId: string, pageToken: string): Promise<void> {
  await fetch(
    `${GRAPH}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(pageToken)}`,
    { method: "DELETE" }
  ).catch(() => {});
}

// --- ניתוב לפי טופס ----------------------------------------------------------
// כל טופס Lead Ads יכול להיות מנותב לפרויקט משלו (MetaPage.routing).
// טופס ללא כלל → המקור של החיבור (הפרויקט שאליו חובר העמוד).

export interface FormRoute {
  formId: string;
  formName?: string;
  projectId: string;
}

export function parseRouting(raw: string | null): FormRoute[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter((r: any) => r && typeof r.formId === "string" && typeof r.projectId === "string")
      : [];
  } catch {
    return [];
  }
}

/** רשימת הטפסים של העמוד (לעורך הניתוב). */
export async function listPageForms(
  metaPageDbId: string
): Promise<{ id: string; name: string; status: string }[]> {
  const page = await prisma.metaPage.findUnique({ where: { id: metaPageDbId } });
  if (!page) throw new Error("החיבור לא נמצא");
  const res = await fetch(
    `${GRAPH}/${page.pageId}/leadgen_forms?fields=id,name,status&limit=100&access_token=${encodeURIComponent(page.pageToken)}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`שליפת טפסים נכשלה: ${JSON.stringify(data.error ?? data).slice(0, 200)}`);
  }
  return (data.data ?? []).map((f: any) => ({
    id: String(f.id),
    name: String(f.name ?? f.id),
    status: String(f.status ?? ""),
  }));
}

/** טוקן הקליטה לליד לפי הטופס שלו: כלל ניתוב → מקור פייסבוק של פרויקט היעד
 *  (נוצר אוטומטית בפעם הראשונה); בלי כלל → המקור של החיבור. */
async function resolveTokenForForm(
  page: { id: string; clientId: string; pageName: string; routing: string | null },
  formId: string | null | undefined,
  fallbackToken: string
): Promise<string> {
  if (!formId) return fallbackToken;
  const rule = parseRouting(page.routing).find((r) => r.formId === String(formId));
  if (!rule) return fallbackToken;
  const existing = await prisma.leadSource.findFirst({
    where: { projectId: rule.projectId, channel: "facebook", kind: "form", active: true },
    select: { token: true },
  });
  if (existing) return existing.token;
  const project = await prisma.project.findUnique({
    where: { id: rule.projectId },
    select: { id: true, clientId: true },
  });
  // פרויקט נמחק/של לקוח אחר — נפילה בטוחה למקור של החיבור.
  if (!project || project.clientId !== page.clientId) return fallbackToken;
  const created = await prisma.leadSource.create({
    data: {
      clientId: page.clientId,
      projectId: rule.projectId,
      name: `פייסבוק — ${page.pageName}`,
      token: `src_${crypto.randomBytes(18).toString("hex")}`,
      kind: "form",
      channel: "facebook",
    },
  });
  return created.token;
}

// --- עיבוד ליד נכנס -----------------------------------------------------------

/** משיכת ליד מלא מ-Graph לפי מזהה. */
async function fetchLeadgen(leadgenId: string, pageToken: string): Promise<Record<string, any>> {
  const fields = "id,created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id,platform";
  const res = await fetch(
    `${GRAPH}/${leadgenId}?fields=${fields}&access_token=${encodeURIComponent(pageToken)}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`משיכת ליד נכשלה: ${JSON.stringify(data.error ?? data).slice(0, 300)}`);
  }
  return data;
}

/** field_data של Meta → מפתחות שצינור הקליטה כבר מכיר (ALIASES). */
function mapToIntakePayload(lead: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of lead.field_data ?? []) {
    const key = String(f.name ?? "").toLowerCase();
    const value = Array.isArray(f.values) ? f.values.join(", ") : String(f.values ?? "");
    if (!value) continue;
    out[key] = value; // full_name / phone_number / email / city + שדות מותאמים
  }
  out.id = lead.id; // externalId — מגן כפילויות גם על שליחה חוזרת של Meta
  if (lead.campaign_name) out.campaign_name = lead.campaign_name;
  if (lead.adset_name) out.adset_name = lead.adset_name;
  if (lead.ad_name) out.ad_name = lead.ad_name;
  out.platform = lead.platform === "ig" ? "instagram" : "facebook";
  out.channel = "facebook";
  return out;
}

/** משיכת לידים אחרונים מהעמוד (טפסי Lead Ads) — גיבוי לוובהוק ואימות חיבור.
 *  עובר על כל הטפסים של העמוד ומזרים כל ליד לצינור הקליטה; מגן הכפילויות
 *  (externalId = מזהה הליד ב-Meta) מונע כפל מול לידים שכבר הגיעו בוובהוק. */
export async function pullRecentLeads(
  metaPageDbId: string,
  days = 30
): Promise<{ forms: number; scanned: number; sent: number; errors: string[] }> {
  const page = await prisma.metaPage.findUnique({
    where: { id: metaPageDbId },
    include: { source: { select: { token: true, active: true } } },
  });
  if (!page?.active || !page.source?.active) {
    throw new Error("העמוד לא מחובר או שהמקור כבוי");
  }
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const base = process.env.APP_BASE_URL || "https://app.apolloadv.co.il";
  const out = { forms: 0, scanned: 0, sent: 0, errors: [] as string[] };

  const formsRes = await fetch(
    `${GRAPH}/${page.pageId}/leadgen_forms?fields=id,name,status&limit=50&access_token=${encodeURIComponent(page.pageToken)}`
  );
  const formsData = await formsRes.json();
  if (!formsRes.ok) {
    throw new Error(`שליפת טפסים נכשלה: ${JSON.stringify(formsData.error ?? formsData).slice(0, 200)}`);
  }

  for (const form of formsData.data ?? []) {
    out.forms++;
    // ניתוב: לידים של הטופס הזה נשלחים למקור של פרויקט היעד (אם הוגדר כלל).
    const formToken = await resolveTokenForForm(page, form.id, page.source.token);
    let url =
      `${GRAPH}/${form.id}/leads?fields=id,created_time,field_data,ad_id,ad_name,adset_name,campaign_name,platform&limit=100&access_token=${encodeURIComponent(page.pageToken)}`;
    for (let i = 0; i < 3 && url; i++) {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        out.errors.push(`${form.name}: ${JSON.stringify(data.error ?? data).slice(0, 150)}`);
        break;
      }
      let reachedOld = false;
      for (const lead of data.data ?? []) {
        out.scanned++;
        if (lead.created_time && new Date(lead.created_time).getTime() < cutoff) {
          reachedOld = true;
          continue;
        }
        // ליד שכבר נקלט (externalId) — דילוג זול לפני קריאת intake, כדי
        // שהמשיכה המחזורית (cron) לא תייצר עשרות קריאות-עצמיות מיותרות.
        const exists = await prisma.lead.findFirst({
          where: { clientId: page.clientId, externalId: String(lead.id) },
          select: { id: true },
        });
        if (exists) continue;
        try {
          const payload = mapToIntakePayload(lead);
          const r = await fetch(`${base.replace(/\/$/, "")}/api/intake/${formToken}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (r.ok) out.sent++;
        } catch (err) {
          out.errors.push(String((err as Error)?.message ?? err).slice(0, 100));
        }
      }
      url = reachedOld ? "" : data.paging?.next ?? "";
    }
  }

  if (out.sent > 0) {
    await prisma.metaPage.update({
      where: { id: page.id },
      data: { lastLeadAt: new Date(), lastError: null },
    });
  }
  return out;
}

/** אירוע leadgen מהוובהוק: עמוד + מזהה ליד → משיכה → הזרמה לקליטה. */
export async function processLeadgenEvent(
  pageId: string,
  leadgenId: string
): Promise<{ ok: boolean; note: string }> {
  const page = await prisma.metaPage.findUnique({
    where: { pageId },
    include: { source: { select: { token: true, active: true } } },
  });
  if (!page?.active || !page.source?.active) {
    return { ok: false, note: `עמוד ${pageId} לא מחובר/כבוי` };
  }
  try {
    const lead = await fetchLeadgen(leadgenId, page.pageToken);
    const payload = mapToIntakePayload(lead);
    // ניתוב לפי הטופס שממנו הגיע הליד (form_id מהמשיכה).
    const token = await resolveTokenForForm(page, lead.form_id, page.source.token);
    const base = process.env.APP_BASE_URL || "https://app.apolloadv.co.il";
    const res = await fetch(`${base.replace(/\/$/, "")}/api/intake/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`intake ${res.status}`);
    await prisma.metaPage.update({
      where: { id: page.id },
      data: { lastLeadAt: new Date(), lastError: null },
    });
    return { ok: true, note: leadgenId };
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).slice(0, 300);
    await prisma.metaPage
      .update({ where: { id: page.id }, data: { lastError: msg } })
      .catch(() => {});
    console.error("[meta leadgen]", pageId, leadgenId, msg);
    return { ok: false, note: msg };
  }
}
