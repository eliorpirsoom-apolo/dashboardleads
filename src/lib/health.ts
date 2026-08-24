import { prisma } from "./prisma";
import { sendMessage, emailConfigured, smsConfigured } from "./messaging";
import { whatsappConfigured } from "./whatsapp";
import { r2Configured, putObject, getObject, deleteObject } from "./storage";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// מנוע בריאות המערכת — בדיקת QA מקיפה שרצה פעמיים ביום (וגם ידנית):
// DB, אתר, קרונים (דופק), קליטת לידים מקצה-לקצה, פייסבוק, וואטסאפ, מייל,
// SMS, תמלול, R2, OpenAI, SUMIT. תקלה → וואטסאפ + מייל לבעלים, עם dedup
// (התראה בפתיחה, תזכורת יומית כל עוד פתוחה, והודעת "נפתר" בסגירה).
// ---------------------------------------------------------------------------

const ALERT_PHONE = process.env.HEALTH_ALERT_PHONE || "0542166156";
const ALERT_EMAIL = process.env.HEALTH_ALERT_EMAIL || "eliorbucris@gmail.com";
const GRAPH = "https://graph.facebook.com/v21.0";
const BASE = (process.env.APP_BASE_URL || "https://app.apolloadv.co.il").replace(/\/$/, "");

// לקוח נסתר לבדיקת צינור הקליטה מקצה-לקצה (active=false — לא מפריע ברשימות).
const SYNTH_CLIENT_NAME = "🩺 בדיקות מערכת — אוטומטי";

export type HealthStatus = "ok" | "warn" | "fail";

export interface HealthResult {
  key: string;
  label: string;
  status: HealthStatus;
  detail?: string;
  ms?: number;
}

// --- דופק קרונים -------------------------------------------------------------

export async function touchCronHeartbeat(id: string, note?: string): Promise<void> {
  try {
    await prisma.cronHeartbeat.upsert({
      where: { id },
      update: { lastRunAt: new Date(), note: note ?? null },
      create: { id, note: note ?? null },
    });
  } catch {
    /* דופק לעולם לא מפיל קרון */
  }
}

// --- מסגרת הרצה --------------------------------------------------------------

async function run(
  key: string,
  label: string,
  fn: () => Promise<Omit<HealthResult, "key" | "label" | "ms">>
): Promise<HealthResult> {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { key, label, ...r, ms: Date.now() - t0 };
  } catch (err) {
    return {
      key,
      label,
      status: "fail",
      detail: String((err as Error)?.message ?? err).slice(0, 200),
      ms: Date.now() - t0,
    };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what}: לא ענה תוך ${ms / 1000} שניות`)), ms)),
  ]);
}

// --- הבדיקות -----------------------------------------------------------------

async function checkDb(): Promise<Omit<HealthResult, "key" | "label" | "ms">> {
  const t0 = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  const ms = Date.now() - t0;
  if (ms > 3000) return { status: "warn", detail: `זמן תגובה איטי: ${ms}ms` };
  return { status: "ok", detail: `${ms}ms` };
}

async function checkSite(): Promise<Omit<HealthResult, "key" | "label" | "ms">> {
  // POST לטוקן קליטה לא-קיים: 404 = האפליקציה וה-DB חיים; 5xx = תקלה.
  const res = await withTimeout(
    fetch(`${BASE}/api/intake/health-probe-bogus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
    10000,
    "האתר"
  );
  if (res.status === 404) return { status: "ok" };
  if (res.status >= 500) return { status: "fail", detail: `האתר מחזיר ${res.status}` };
  return { status: "warn", detail: `תשובה לא צפויה: ${res.status}` };
}

async function checkCrons(): Promise<HealthResult[]> {
  const rules: { id: string; label: string; maxMin: number; sev: HealthStatus }[] = [
    { id: "reminders", label: "קרון תזכורות/תמלול", maxMin: 15, sev: "fail" },
    { id: "meta-pull", label: "קרון משיכת לידים מפייסבוק", maxMin: 15, sev: "fail" },
    { id: "sumit", label: "קרון סנכרון SUMIT", maxMin: 45, sev: "warn" },
  ];
  const beats = await prisma.cronHeartbeat.findMany();
  const byId = new Map(beats.map((b) => [b.id, b]));
  return rules.map((r) => {
    const beat = byId.get(r.id);
    if (!beat) {
      return {
        key: `cron:${r.id}`,
        label: r.label,
        status: "warn" as HealthStatus,
        detail: "טרם נרשם דופק (נרשם אוטומטית מהריצה הראשונה אחרי הפריסה)",
      };
    }
    const ageMin = Math.round((Date.now() - beat.lastRunAt.getTime()) / 60000);
    if (ageMin > r.maxMin) {
      return {
        key: `cron:${r.id}`,
        label: r.label,
        status: r.sev,
        detail: `לא רץ כבר ${ageMin} דקות (מקסימום תקין: ${r.maxMin})`,
      };
    }
    return { key: `cron:${r.id}`, label: r.label, status: "ok" as HealthStatus, detail: `רץ לפני ${ageMin} דק'` };
  });
}

async function checkGreenApi(): Promise<Omit<HealthResult, "key" | "label" | "ms">> {
  if (!whatsappConfigured()) return { status: "fail", detail: "GREENAPI_ID_INSTANCE/API_TOKEN חסרים" };
  const id = process.env.GREENAPI_ID_INSTANCE!;
  const token = process.env.GREENAPI_API_TOKEN!;
  const base = (process.env.GREENAPI_API_URL || "https://api.green-api.com").replace(/\/$/, "");
  const res = await withTimeout(fetch(`${base}/waInstance${id}/getStateInstance/${token}`, { cache: "no-store" }), 10000, "Green API");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { status: "fail", detail: `Green API HTTP ${res.status}` };
  if (data.stateInstance !== "authorized") {
    return { status: "fail", detail: `מופע וואטסאפ במצב "${data.stateInstance}" — נדרש סריקת QR/חיבור מחדש` };
  }
  return { status: "ok" };
}

async function checkEmail(): Promise<Omit<HealthResult, "key" | "label" | "ms">> {
  if (!emailConfigured()) return { status: "fail", detail: "SMTP לא מוגדר (SMTP_HOST/USER)" };
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  await withTimeout(transport.verify(), 10000, "שרת המייל");
  return { status: "ok" };
}

async function checkSms(): Promise<Omit<HealthResult, "key" | "label" | "ms">> {
  if (!smsConfigured()) {
    return { status: "warn", detail: "SMS לא מוגדר (MULTISEND_USER/PASSWORD)" };
  }
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const failed = await prisma.message.count({
    where: { channel: "sms", status: "failed", createdAt: { gte: twelveHoursAgo } },
  });
  if (failed > 0) return { status: "warn", detail: `${failed} הודעות SMS נכשלו ב-12 השעות האחרונות` };
  return { status: "ok" };
}

async function checkOpenAi(): Promise<Omit<HealthResult, "key" | "label" | "ms">> {
  if (!process.env.OPENAI_API_KEY) return { status: "fail", detail: "OPENAI_API_KEY חסר — אין תמלול/סוכן" };
  const res = await withTimeout(
    fetch("https://api.openai.com/v1/models?limit=1", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    }),
    10000,
    "OpenAI"
  );
  if (res.status === 401) return { status: "fail", detail: "מפתח OpenAI לא תקין (401)" };
  if (!res.ok) return { status: "warn", detail: `OpenAI מחזיר ${res.status}` };
  return { status: "ok" };
}

async function checkR2(): Promise<Omit<HealthResult, "key" | "label" | "ms">> {
  if (!r2Configured()) return { status: "fail", detail: "R2 לא מוגדר — הקלטות שיחה לא יישמרו" };
  const key = `health/probe-${crypto.randomBytes(6).toString("hex")}.txt`;
  await withTimeout(putObject(key, Buffer.from("health-probe"), "text/plain"), 15000, "R2 כתיבה");
  const buf = await withTimeout(getObject(key), 15000, "R2 קריאה");
  await deleteObject(key).catch(() => {});
  if (buf.toString() !== "health-probe") return { status: "fail", detail: "R2: הקובץ שנקרא שונה מהקובץ שנכתב" };
  return { status: "ok" };
}

async function checkTranscription(): Promise<Omit<HealthResult, "key" | "label" | "ms">> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const [stuck, failed] = await Promise.all([
    prisma.lead.count({
      where: { kind: "call", callTranscriptStatus: "pending", createdAt: { lt: twoHoursAgo } },
    }),
    prisma.lead.count({
      where: { kind: "call", callTranscriptStatus: "failed", updatedAt: { gte: twelveHoursAgo } },
    }),
  ]);
  if (stuck > 5) return { status: "fail", detail: `${stuck} שיחות תקועות בתמלול מעל שעתיים` };
  if (stuck > 0) return { status: "warn", detail: `${stuck} שיחות ממתינות לתמלול מעל שעתיים` };
  if (failed >= 3) return { status: "warn", detail: `${failed} תמלולים נכשלו ב-12 השעות האחרונות` };
  return { status: "ok" };
}

async function checkIntakeLog(): Promise<Omit<HealthResult, "key" | "label" | "ms">> {
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const [errors, rejected] = await Promise.all([
    prisma.intakeLog.count({ where: { status: "error", createdAt: { gte: twelveHoursAgo } } }),
    prisma.intakeLog.count({ where: { status: "rejected", createdAt: { gte: twelveHoursAgo } } }),
  ]);
  if (errors > 0) return { status: "fail", detail: `${errors} שגיאות קליטה ב-12 השעות האחרונות (יומן הקליטה)` };
  if (rejected > 10) return { status: "warn", detail: `${rejected} קליטות נדחו ב-12 השעות האחרונות` };
  return { status: "ok" };
}

async function checkMetaPages(): Promise<HealthResult[]> {
  const pages = await prisma.metaPage.findMany({
    where: { active: true },
    select: { pageId: true, pageName: true, pageToken: true, lastError: true },
  });
  const out: HealthResult[] = [];
  for (const p of pages) {
    out.push(
      await run(`meta-page:${p.pageId}`, `פייסבוק — ${p.pageName}`, async () => {
        const res = await withTimeout(
          fetch(`${GRAPH}/${p.pageId}?fields=id&access_token=${encodeURIComponent(p.pageToken)}`, { cache: "no-store" }),
          10000,
          "Graph API"
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            status: "fail" as HealthStatus,
            detail: `טוקן העמוד לא תקין: ${String(data?.error?.message ?? res.status).slice(0, 120)} — יש לחבר את העמוד מחדש`,
          };
        }
        // תוקף הטוקן — התראה 10 ימים מראש (0 = ללא תפוגה).
        if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
          const dbg = await fetch(
            `${GRAPH}/debug_token?input_token=${encodeURIComponent(p.pageToken)}&access_token=${encodeURIComponent(`${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`)}`,
            { cache: "no-store" }
          ).then((r) => r.json()).catch(() => null);
          const exp = dbg?.data?.expires_at;
          if (exp && exp > 0) {
            const daysLeft = Math.floor((exp * 1000 - Date.now()) / 86400000);
            if (daysLeft <= 10) {
              return {
                status: "warn" as HealthStatus,
                detail: `טוקן העמוד יפוג בעוד ${daysLeft} ימים — יש לחבר את העמוד מחדש`,
              };
            }
          }
        }
        if (p.lastError) return { status: "warn" as HealthStatus, detail: `שגיאה אחרונה: ${p.lastError.slice(0, 120)}` };
        return { status: "ok" as HealthStatus };
      })
    );
  }
  return out;
}

// קליטה מקצה-לקצה: ליד סינתטי נכנס דרך ה-webhook האמיתי, נבדק — ונמחק.
async function checkIntakeE2e(): Promise<Omit<HealthResult, "key" | "label" | "ms">> {
  const client = await prisma.client.upsert({
    where: { name: SYNTH_CLIENT_NAME },
    update: {},
    create: { name: SYNTH_CLIENT_NAME, type: "general", active: false },
  });
  let source = await prisma.leadSource.findFirst({
    where: { clientId: client.id, kind: "form", active: true },
  });
  if (!source) {
    source = await prisma.leadSource.create({
      data: {
        clientId: client.id,
        name: "בדיקת קליטה אוטומטית",
        token: `src_${crypto.randomBytes(18).toString("hex")}`,
        kind: "form",
        channel: "other",
      },
    });
  }
  const externalId = `health_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const res = await withTimeout(
    fetch(`${BASE}/api/intake/${source.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: "בדיקת מערכת אוטומטית",
        phone: "0500000000",
        id: externalId,
      }),
    }),
    15000,
    "צינור הקליטה"
  );
  if (!res.ok) return { status: "fail", detail: `ה-webhook החזיר ${res.status} — לידים לא נקלטים!` };
  const lead = await prisma.lead.findFirst({ where: { clientId: client.id, externalId } });
  if (!lead) return { status: "fail", detail: "ה-webhook ענה תקין אבל הליד לא נוצר ב-DB" };
  // ניקוי — הליד הסינתטי נמחק מיד (cascade מוחק הערות/פעילות).
  await prisma.lead.delete({ where: { id: lead.id } }).catch(() => {});
  return { status: "ok" };
}

function checkEnv(): HealthResult {
  const missing: string[] = [];
  if (!process.env.CRON_SECRET) missing.push("CRON_SECRET");
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) missing.push("META_APP_ID/SECRET");
  if (!process.env.SUMIT_COMPANY_ID || !process.env.SUMIT_API_KEY) missing.push("SUMIT");
  if (missing.length) {
    return { key: "env", label: "משתני סביבה", status: "fail", detail: `חסרים: ${missing.join(", ")}` };
  }
  return { key: "env", label: "משתני סביבה", status: "ok" };
}

// --- ריצה מלאה ---------------------------------------------------------------

export async function runHealthCheck(): Promise<{
  runId: string;
  results: HealthResult[];
  ok: number;
  warn: number;
  fail: number;
}> {
  const started = new Date();
  const results: HealthResult[] = [];

  // הבדיקות המהירות במקביל; הכבדות (E2E, פייסבוק) אחריהן — הכל בתקציב 60 שניות.
  const [db, site, greenapi, email, sms, openai, r2, transcription, intake] = await Promise.all([
    run("db", "מסד הנתונים (Neon)", checkDb),
    run("site", "האתר וה-API", checkSite),
    run("greenapi", "וואטסאפ (Green API)", checkGreenApi),
    run("email", "מייל (SMTP)", checkEmail),
    run("sms", "SMS (MultiSend)", checkSms),
    run("openai", "OpenAI (תמלול וסוכן)", checkOpenAi),
    run("r2", "אחסון הקלטות (R2)", checkR2),
    run("transcription", "תור התמלול", checkTranscription),
    run("intake-log", "יומן הקליטה", checkIntakeLog),
  ]);
  results.push(db, site, greenapi, email, sms, openai, r2, transcription, intake);
  results.push(checkEnv());
  results.push(...(await checkCrons()));
  results.push(...(await checkMetaPages()));
  results.push(await run("intake-e2e", "קליטת לידים מקצה-לקצה", checkIntakeE2e));

  const ok = results.filter((r) => r.status === "ok").length;
  const warn = results.filter((r) => r.status === "warn").length;
  const fail = results.filter((r) => r.status === "fail").length;

  const runRow = await prisma.healthRun.create({
    data: {
      startedAt: started,
      finishedAt: new Date(),
      ok,
      warn,
      fail,
      results: JSON.stringify(results),
    },
  });

  await reconcileIssues(results);
  return { runId: runRow.id, results, ok, warn, fail };
}

// --- ניהול תקלות והתראות ------------------------------------------------------

const DAILY_REMINDER_MS = 20 * 60 * 60 * 1000; // תזכורת על תקלה פתוחה — פעם ביום

async function reconcileIssues(results: HealthResult[]): Promise<void> {
  const now = new Date();
  const problems = results.filter((r) => r.status !== "ok");
  const toAlert: HealthResult[] = [];

  for (const p of problems) {
    const existing = await prisma.healthIssue.findUnique({ where: { key: p.key } });
    const isNew = !existing || existing.resolvedAt !== null;
    const needReminder =
      existing && !existing.resolvedAt &&
      (!existing.notifiedAt || now.getTime() - existing.notifiedAt.getTime() > DAILY_REMINDER_MS);
    const notify = isNew || needReminder;
    await prisma.healthIssue.upsert({
      where: { key: p.key },
      update: {
        label: p.label,
        detail: p.detail ?? null,
        severity: p.status,
        lastSeenAt: now,
        ...(isNew ? { openedAt: now, resolvedAt: null } : {}),
        ...(notify ? { notifiedAt: now } : {}),
      },
      create: {
        key: p.key,
        label: p.label,
        detail: p.detail ?? null,
        severity: p.status,
        notifiedAt: now,
      },
    });
    if (notify) toAlert.push(p);
  }

  // תקלות פתוחות שנעלמו — נפתרו.
  const problemKeys = new Set(problems.map((p) => p.key));
  const open = await prisma.healthIssue.findMany({ where: { resolvedAt: null } });
  const resolved: string[] = [];
  for (const o of open) {
    if (!problemKeys.has(o.key)) {
      await prisma.healthIssue.update({ where: { id: o.id }, data: { resolvedAt: now } });
      resolved.push(o.label);
    }
  }

  if (toAlert.length || resolved.length) {
    await sendHealthAlert(toAlert, resolved).catch((err) => console.error("[health:alert]", err));
  }
}

async function sendHealthAlert(problems: HealthResult[], resolved: string[]): Promise<void> {
  const lines: string[] = [];
  if (problems.length) {
    lines.push("🩺 Apollo CRM — בדיקת המערכת מצאה תקלות:");
    for (const p of problems) {
      lines.push(`${p.status === "fail" ? "❌" : "⚠️"} ${p.label}${p.detail ? ` — ${p.detail}` : ""}`);
    }
  }
  if (resolved.length) {
    lines.push(problems.length ? "" : "🩺 Apollo CRM:", `✅ נפתרו: ${resolved.join(" · ")}`);
  }
  if (problems.length) {
    lines.push(
      "",
      "לטיפול אוטומטי — העתק לקלוד:",
      `"תבדוק ותתקן במערכת: ${problems.map((p) => p.label).join("; ")}"`,
      "",
      `פירוט מלא: ${BASE}/admin/health`
    );
  }
  const body = lines.join("\n");
  const subject = problems.length
    ? `🩺 Apollo CRM — ${problems.length} תקלות בבדיקת המערכת`
    : "🩺 Apollo CRM — התקלות נפתרו";
  await sendMessage({ channel: "whatsapp", to: ALERT_PHONE, body, kind: "system" });
  await sendMessage({ channel: "email", to: ALERT_EMAIL, subject, body, kind: "system" });
}
