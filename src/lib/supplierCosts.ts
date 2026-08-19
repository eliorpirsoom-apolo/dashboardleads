import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// אומדני עלות דינמיים לספקי צד-ג' — מחושבים מטלמטריה פנימית של המערכת
// (בלי מפתחות API של הספקים). האומדן מוצג כ"אומדן" והוא הערכה, לא חשבונית.
// ---------------------------------------------------------------------------

function monthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
function daysInMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

// Neon Launch: המחשוב ער 24/7 (קרון כל 5 דק') על 0.25CU, $0.106 לשעת-CU.
function estimateNeon(): number {
  return Math.round(daysInMonth() * 24 * 0.25 * 0.106 * 100) / 100;
}

// OpenAI: תמלולים (≈3 דק' לשיחה, $0.006/דק') + סיכומים וסוכן משימות (gpt-4o-mini, זניח יחסית).
async function estimateOpenai(): Promise<number> {
  const from = monthStart();
  const [transcripts, agentItems] = await Promise.all([
    prisma.lead.count({
      where: { kind: "call", callTranscriptStatus: { in: ["done", "no_speech"] }, updatedAt: { gte: from } },
    }),
    prisma.taskInbox.count({ where: { source: "whatsapp", createdAt: { gte: from } } }),
  ]);
  // הקרנה לחודש מלא לפי הקצב עד כה.
  const dayOfMonth = new Date().getDate();
  const monthly = ((transcripts * (3 * 0.006 + 0.002) + agentItems * 0.001) / Math.max(dayOfMonth, 1)) * daysInMonth();
  return Math.round(monthly * 100) / 100;
}

// SMS: הודעות שנשלחו החודש × תעריף ליחידה (ברירת מחדל ‎0.07₪‎ — ניתן לעריכה בשורה).
async function estimateSms(unitRate: number | null): Promise<number> {
  const sent = await prisma.message.count({
    where: { channel: "sms", status: "sent", createdAt: { gte: monthStart() } },
  });
  const dayOfMonth = new Date().getDate();
  const monthly = ((sent * (unitRate ?? 0.07)) / Math.max(dayOfMonth, 1)) * daysInMonth();
  return Math.round(monthly * 100) / 100;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// רענון אומדנים לשורות דינמיות — רק אם עברו 7 ימים (או force, למשל מכפתור "רענון").
export async function refreshSupplierEstimates(force = false): Promise<number> {
  const rows = await prisma.supplierCost.findMany({ where: { active: true, kind: "dynamic", estimator: { not: null } } });
  let updated = 0;
  for (const r of rows) {
    if (!force && r.lastEstimatedAt && Date.now() - r.lastEstimatedAt.getTime() < WEEK_MS) continue;
    let est: number | null = null;
    if (r.estimator === "neon") est = estimateNeon();
    else if (r.estimator === "openai") est = await estimateOpenai();
    else if (r.estimator === "sms") est = await estimateSms(r.unitRate);
    if (est === null) continue;
    await prisma.supplierCost.update({
      where: { id: r.id },
      data: { lastEstimate: est, lastEstimatedAt: new Date() },
    });
    updated++;
  }
  return updated;
}

// זריעת ברירות מחדל בפעם הראשונה — טבלת הספקים הנוכחית של המערכת.
export async function ensureSupplierDefaults(): Promise<void> {
  const count = await prisma.supplierCost.count();
  if (count > 0) return;
  await prisma.supplierCost.createMany({
    data: [
      { name: "Vercel Pro", note: "אירוח האפליקציה + קרונים", currency: "USD", kind: "fixed", fixedAmount: 20, orderIndex: 0 },
      { name: "Neon — בסיס נתונים", note: "Launch, לפי שימוש (DB ער 24/7)", currency: "USD", kind: "dynamic", estimator: "neon", orderIndex: 1 },
      { name: "Green API — וואטסאפ", note: "מופע Business", currency: "USD", kind: "fixed", fixedAmount: 12, orderIndex: 2 },
      { name: "OpenAI", note: "תמלול+סיכום שיחות, סוכן יעקב, בריפים", currency: "USD", kind: "dynamic", estimator: "openai", orderIndex: 3 },
      { name: "MultiSend — SMS", note: "לפי הודעה (תעריף ליחידה ניתן לעריכה)", currency: "ILS", kind: "dynamic", estimator: "sms", unitRate: 0.07, orderIndex: 4 },
    ],
  });
}
