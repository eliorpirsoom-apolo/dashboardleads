import crypto from "crypto";
import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// שיגור לידים החוצה (Outbound lead forwarding).
//
// כל ליד חדש (onLeadCreated) נדחף ליעדי ה-webhook המוגדרים ללקוח/פרויקט שלו.
// מנוע גנרי: מעטפת JSON תקנית כברירת מחדל, ומיפוי-שדות אופציונלי פר-יעד כדי
// להתאים בדיוק לשמות שה-API של היעד דורש (GoHighLevel, CRM אחר, Make וכו').
//
// עקרונות: לא-חוסם (כשל שיגור לא מפיל יצירת ליד), timeout + ניסיונות חוזרים,
// וכל מסירה נרשמת ב-LeadForwardLog.
// ---------------------------------------------------------------------------

// השיגור רץ על מסלול התגובה של הקליטה (onLeadCreated) — חוסמים זמן קצר
// כדי שיעד איטי/מת לא יפיל את בקשת הקליטה. כשלים נרשמים וניתנים לשליחה חוזרת.
const TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 2;

type LeadWebhookRow = {
  id: string;
  name: string;
  url: string;
  method: string;
  format: string;
  authHeader: string | null;
  authValue: string | null;
  secret: string | null;
  fieldMap: string | null;
};

export interface ForwardResult {
  webhookId: string;
  name: string;
  ok: boolean;
  httpCode: number | null;
  error: string | null;
  attempt: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// "0501234567" → "+972501234567" (למערכות שמצפות לפורמט בינלאומי, כמו GHL).
function toE164IL(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("972")) return "+" + d;
  if (d.startsWith("0")) return "+972" + d.slice(1);
  return phone.startsWith("+") ? phone : "+" + d;
}

// שליפת ערך לפי נתיב-נקודה ("custom.utm_source") מתוך מעטפת הליד.
function getPath(obj: Record<string, unknown>, path: string): unknown {
  if (path in obj) return obj[path];
  let node: unknown = obj;
  for (const part of path.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return node;
}

type LeadForEnvelope = {
  id: string;
  number: number;
  clientId: string;
  externalId: string | null;
  kind: string;
  campaignId: string | null;
  projectId: string | null;
  unitTypeId: string | null;
  statusId: string | null;
  sourceId: string | null;
  assigneeId: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  channel: string | null;
  platform: string | null;
  campaignLabel: string | null;
  audience: string | null;
  adName: string | null;
  consent: boolean;
  callDurationSec: number | null;
  callRecordingUrl: string | null;
  callStatus: string | null;
  callAdNumber: string | null;
  callTargetNumber: string | null;
  callTargetName: string | null;
  callTranscript: string | null;
  callSummary: string | null;
  callRecordingKey: string | null;
  callTranscriptStatus: string | null;
  archived: boolean;
  firstHandledAt: Date | null;
  slaMarketerRemindedAt: Date | null;
  slaEscalatedAt: Date | null;
  data: string | null;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  client: { name: string } | null;
  project: { name: string } | null;
  source: { name: string; kind: string } | null;
  campaign: { name: string } | null;
  status: { name: string; systemKind: string | null } | null;
  assignee: { name: string | null; email: string | null; phone: string | null } | null;
  unitType: { name: string; rooms: number | null; price: number } | null;
};

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

// מעטפת מלאה של הליד — נשלח *כל* שדה שיש בליד, והמערכת הקולטת בוחרת מה למפות.
// כולל: שדות גולמיים, שמות מפוענחים של הקשרים, שדות-נוחות גזורים, וכל השדות
// המותאמים מתוך data (תחת custom + שטוחים ברמה העליונה בקידומת custom_).
function buildEnvelope(lead: LeadForEnvelope): Record<string, unknown> {
  const parts = (lead.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  let custom: Record<string, unknown> = {};
  if (lead.data) {
    try {
      const p = JSON.parse(lead.data);
      if (p && typeof p === "object" && !Array.isArray(p)) custom = p;
    } catch {
      /* data לא תקין — מתעלמים */
    }
  }
  // שטוח גם ברמה העליונה (custom_<key>) כדי שמערכות שממפות שדות שטוחים יראו אותם.
  const flatCustom: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(custom)) flatCustom[`custom_${k}`] = v;

  return {
    // --- זיהוי ---
    leadId: lead.id,
    number: lead.number,
    externalId: lead.externalId,
    kind: lead.kind,
    // --- פרטי יצירת קשר ---
    fullName: lead.fullName,
    name: lead.fullName, // כינוי נפוץ
    firstName: parts.length ? parts[0] : null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
    phone: lead.phone,
    phoneE164: toE164IL(lead.phone),
    email: lead.email,
    city: lead.city,
    consent: lead.consent,
    // --- מקור ושיווק ---
    channel: lead.channel,
    platform: lead.platform,
    campaign: lead.campaign?.name ?? lead.campaignLabel ?? null,
    campaignLabel: lead.campaignLabel,
    audience: lead.audience,
    adName: lead.adName,
    source: lead.source?.name ?? null,
    sourceKind: lead.source?.kind ?? null,
    // --- שיוך פנימי (שמות + מזהים) ---
    client: lead.client?.name ?? null,
    clientId: lead.clientId,
    project: lead.project?.name ?? null,
    projectId: lead.projectId,
    status: lead.status?.name ?? null,
    statusKind: lead.status?.systemKind ?? null,
    statusId: lead.statusId,
    assignee: lead.assignee?.name ?? null,
    assigneeEmail: lead.assignee?.email ?? null,
    assigneePhone: lead.assignee?.phone ?? null,
    assigneeId: lead.assigneeId,
    unitType: lead.unitType?.name ?? null,
    unitTypeRooms: lead.unitType?.rooms ?? null,
    unitTypePrice: lead.unitType?.price ?? null,
    unitTypeId: lead.unitTypeId,
    campaignId: lead.campaignId,
    // --- נתוני שיחה (לידים טלפוניים) ---
    callDurationSec: lead.callDurationSec,
    callStatus: lead.callStatus,
    callSummary: lead.callSummary,
    callTranscript: lead.callTranscript,
    callRecordingUrl: lead.callRecordingUrl,
    callAdNumber: lead.callAdNumber,
    callTargetNumber: lead.callTargetNumber,
    callTargetName: lead.callTargetName,
    callTranscriptStatus: lead.callTranscriptStatus,
    // --- סטטוס ומעקב ---
    archived: lead.archived,
    firstHandledAt: iso(lead.firstHandledAt),
    receivedAt: iso(lead.receivedAt),
    createdAt: iso(lead.createdAt),
    updatedAt: iso(lead.updatedAt),
    // --- שדות מותאמים (data) ---
    custom,
    ...flatCustom,
  };
}

// החלת מיפוי-שדות: אם הוגדר, הגוף נבנה אך ורק מהמפתחות שה-API של היעד דורש.
// { "first_name": "firstName", "Phone": "phoneE164", "utm": "custom.utm_source" }
function applyFieldMap(
  env: Record<string, unknown>,
  fieldMap: string | null
): Record<string, unknown> {
  if (!fieldMap) return env;
  let map: Record<string, string>;
  try {
    map = JSON.parse(fieldMap);
  } catch {
    return env;
  }
  if (!map || typeof map !== "object" || Array.isArray(map) || Object.keys(map).length === 0) {
    return env;
  }
  const out: Record<string, unknown> = {};
  for (const [destKey, srcKey] of Object.entries(map)) {
    const v = getPath(env, String(srcKey));
    out[destKey] = v === undefined ? null : v;
  }
  return out;
}

// המרה לגוף x-www-form-urlencoded (אובייקטים מקוננים → JSON מחרוזת).
function toFormBody(body: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v === null || v === undefined) continue;
    sp.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return sp.toString();
}

interface DeliverOutcome {
  ok: boolean;
  httpCode: number | null;
  error: string | null;
  responseBody: string | null;
  attempt: number;
}

// שליחה בודדת ליעד עם timeout + ניסיונות חוזרים (רק על 5xx/429/שגיאת רשת).
async function deliver(
  hook: LeadWebhookRow,
  body: Record<string, unknown>
): Promise<DeliverOutcome> {
  const isForm = hook.format === "form";
  const payload = isForm ? toFormBody(body) : JSON.stringify(body);
  const headers: Record<string, string> = {
    "Content-Type": isForm ? "application/x-www-form-urlencoded" : "application/json",
  };
  if (hook.authHeader && hook.authValue) headers[hook.authHeader] = hook.authValue;
  if (hook.secret) {
    headers["X-Apollo-Signature"] =
      "sha256=" + crypto.createHmac("sha256", hook.secret).update(payload).digest("hex");
  }

  let last: DeliverOutcome = { ok: false, httpCode: null, error: "לא בוצע ניסיון", responseBody: null, attempt: 0 };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(hook.url, {
          method: (hook.method || "POST").toUpperCase(),
          headers,
          body: payload,
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const text = (await res.text().catch(() => "")).slice(0, 2000);
      if (res.ok) {
        return { ok: true, httpCode: res.status, error: null, responseBody: text || null, attempt };
      }
      last = {
        ok: false,
        httpCode: res.status,
        error: `HTTP ${res.status}`,
        responseBody: text || null,
        attempt,
      };
      // 4xx (למעט 429) = בעיית הגדרה אצל היעד — אין טעם לנסות שוב.
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      const msg = (e as Error)?.name === "AbortError" ? "timeout (10 שניות)" : String((e as Error)?.message ?? e);
      last = { ok: false, httpCode: null, error: msg.slice(0, 300), responseBody: null, attempt };
    }
    if (attempt < MAX_ATTEMPTS) await sleep(attempt * 800);
  }
  return last;
}

// יעדי השיגור הרלוונטיים לליד: של הפרויקט שלו + יעדי כלל-הלקוח (projectId null).
async function webhooksForLead(clientId: string, projectId: string | null) {
  const where: Record<string, unknown> = { clientId, active: true };
  if (projectId) where.OR = [{ projectId: null }, { projectId }];
  else where.projectId = null;
  return prisma.leadWebhook.findMany({ where, orderBy: { createdAt: "asc" } });
}

async function logDelivery(
  hook: LeadWebhookRow,
  leadId: string | null,
  body: Record<string, unknown>,
  r: DeliverOutcome
): Promise<void> {
  await prisma.leadForwardLog
    .create({
      data: {
        webhookId: hook.id,
        leadId,
        status: r.ok ? "ok" : "error",
        httpCode: r.httpCode ?? null,
        error: r.ok ? null : r.error,
        requestBody: JSON.stringify(body).slice(0, 4000),
        responseBody: r.responseBody,
        attempt: r.attempt || 1,
      },
    })
    .catch(() => {});
  await prisma.leadWebhook
    .update({
      where: { id: hook.id },
      data: { lastStatus: r.ok ? "ok" : "error", lastError: r.ok ? null : r.error, lastSentAt: new Date() },
    })
    .catch(() => {});
}

const LEAD_INCLUDE = {
  client: { select: { name: true } },
  project: { select: { name: true } },
  source: { select: { name: true, kind: true } },
  campaign: { select: { name: true } },
  status: { select: { name: true, systemKind: true } },
  assignee: { select: { name: true, email: true, phone: true } },
  unitType: { select: { name: true, rooms: true, price: true } },
} as const;

/**
 * שיגור ליד לכל היעדים המתאימים. לא-חוסם — נקרא מ-onLeadCreated עם .catch,
 * וגם ידנית מכפתור "שלח שוב". לעולם לא זורק כלפי מעלה.
 */
export async function forwardLeadOutbound(leadId: string): Promise<{ sent: number; results: ForwardResult[] }> {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: LEAD_INCLUDE });
    if (!lead) return { sent: 0, results: [] };
    const hooks = (await webhooksForLead(lead.clientId, lead.projectId)) as LeadWebhookRow[];
    if (hooks.length === 0) return { sent: 0, results: [] };

    const env = buildEnvelope(lead as unknown as LeadForEnvelope);
    const results: ForwardResult[] = [];
    for (const hook of hooks) {
      const body = applyFieldMap(env, hook.fieldMap);
      const r = await deliver(hook, body);
      await logDelivery(hook, lead.id, body, r);
      results.push({ webhookId: hook.id, name: hook.name, ok: r.ok, httpCode: r.httpCode, error: r.error, attempt: r.attempt });
    }
    return { sent: results.filter((r) => r.ok).length, results };
  } catch (e) {
    console.error("[lead-forward]", e);
    return { sent: 0, results: [] };
  }
}

// מעטפת-דוגמה לבדיקת חיבור (אין ליד אמיתי).
function sampleEnvelope(): Record<string, unknown> {
  return {
    leadId: "test",
    number: 0,
    fullName: "ליד בדיקה",
    name: "ליד בדיקה",
    firstName: "ליד",
    lastName: "בדיקה",
    phone: "0501234567",
    phoneE164: "+972501234567",
    email: "test@apolloadv.co.il",
    city: "תל אביב",
    channel: "facebook",
    platform: "instagram",
    campaign: "בדיקת חיבור",
    source: "Apollo CRM",
    kind: "form",
    consent: true,
    receivedAt: new Date().toISOString(),
    test: true,
    custom: { test: true },
  };
}

/** בדיקת חיבור ליעד — שולח מעטפת-דוגמה פעם אחת ומחזיר את התוצאה. */
export async function testLeadWebhook(
  webhookId: string
): Promise<{ ok: boolean; httpCode: number | null; error: string | null; responseBody: string | null }> {
  const hook = (await prisma.leadWebhook.findUnique({ where: { id: webhookId } })) as LeadWebhookRow | null;
  if (!hook) return { ok: false, httpCode: null, error: "יעד לא נמצא", responseBody: null };
  const body = applyFieldMap(sampleEnvelope(), hook.fieldMap);
  const r = await deliver(hook, body);
  await logDelivery(hook, null, body, r);
  return { ok: r.ok, httpCode: r.httpCode, error: r.error, responseBody: r.responseBody };
}
