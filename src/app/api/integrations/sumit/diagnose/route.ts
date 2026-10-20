import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { sumitListDocuments, sumitDocType, type SumitDoc } from "@/lib/integrations/sumit";
import { importOneSumitProposal } from "@/lib/integrations/sumitSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/integrations/sumit/diagnose — אבחון סנכרון SUMIT. מנהל בלבד.
//   ?number=2267  → בדיקה נקודתית: האם ההצעה נמשכה מ-SUMIT ו/או נשמרה ב-CRM.
//   ?import=2267  → ניסיון ייבוא בפועל של ההצעה (מחזיר את השגיאה המדויקת אם נכשל).
export const GET = handle(async (req) => {
  await requireManager();
  const t0 = Date.now();
  const url = new URL(req.url);
  const numberParam = url.searchParams.get("number");
  const importParam = url.searchParams.get("import");

  // ייבוא נקודתי (כתיבה) — מדלג על שאר האבחון, מחזיר תוצאה/שגיאה אמיתית.
  if (importParam) {
    const res = await importOneSumitProposal(Number(importParam));
    return NextResponse.json({ import: res });
  }
  const docs = await sumitListDocuments();
  const elapsedMs = Date.now() - t0;
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const histogram: Record<string, { type: number; category: string; label: string; count: number }> = {};
  for (const d of docs) {
    const { category, label } = sumitDocType(d.Type);
    const key = String(d.Type);
    if (!histogram[key]) histogram[key] = { type: d.Type, category, label, count: 0 };
    histogram[key].count++;
  }

  const brief = (d: SumitDoc) => ({
    number: d.DocumentNumber,
    type: d.Type,
    label: sumitDocType(d.Type).label,
    category: sumitDocType(d.Type).category,
    date: d.Date?.slice(0, 10),
    value: d.DocumentValue,
    customer: d.CustomerName,
  });

  const recent = [...docs]
    .filter((d) => d.Date)
    .sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime())
    .slice(0, 15)
    .map(brief);

  const proposals = docs.filter((d) => sumitDocType(d.Type).category === "proposal");
  const proposalsLast14d = proposals.filter((d) => d.Date && new Date(d.Date) >= cutoff).length;

  const numbers = docs.map((d) => d.DocumentNumber).filter((n) => Number.isFinite(n));
  const dates = docs.map((d) => d.Date).filter(Boolean).sort();

  // חשיפת סדר/היקף הסריקה — לזיהוי עימוד/תקרה שמפספסים את החדשים.
  const scanMeta = {
    scanned: docs.length,
    elapsedMs,
    nearTimeout: elapsedMs > 45000, // מתקרב לתקרת 60 שנ' → סיכון לקטיעה
    numberRange: numbers.length ? { min: Math.min(...numbers), max: Math.max(...numbers) } : null,
    dateRange: dates.length ? { oldest: dates[0]?.slice(0, 10), newest: dates[dates.length - 1]?.slice(0, 10) } : null,
    scanOrderFirst: docs.slice(0, 3).map((d) => ({ number: d.DocumentNumber, date: d.Date?.slice(0, 10) })),
    scanOrderLast: docs.slice(-3).map((d) => ({ number: d.DocumentNumber, date: d.Date?.slice(0, 10) })),
  };

  const [storedQuotes, storedDocuments] = await Promise.all([
    prisma.quote.count({ where: { notes: { contains: "[sumit:" } } }),
    prisma.document.count({ where: { provider: "sumit" } }),
  ]);

  // --- בדיקה נקודתית של מספר הצעה -----------------------------------------
  let lookup: unknown = undefined;
  if (numberParam) {
    const num = Number(numberParam);
    const found = docs.find((d) => d.DocumentNumber === num);
    if (!found) {
      lookup = {
        number: num,
        inSumitScan: false,
        verdict:
          "ההצעה לא נמצאה בסריקה מ-SUMIT. כלומר היא לא נמשכה כלל — כנראה עימוד/תקרה/סדר (ראו scanMeta), או שהיא מחוץ לרשימה שהוחזרה.",
      };
    } else {
      const cat = sumitDocType(found.Type);
      const isProposal = cat.category === "proposal";
      const inWindow = Boolean(found.Date && new Date(found.Date) >= cutoff);
      const storedRow = await prisma.quote.findFirst({
        where: { notes: { contains: `[sumit:${found.DocumentID}]` } },
        select: { id: true, clientId: true, title: true, amount: true, status: true },
      });
      lookup = {
        number: num,
        inSumitScan: true,
        doc: { ...brief(found), documentId: found.DocumentID },
        isProposal,
        withinImportWindow14d: inWindow,
        storedInCrm: Boolean(storedRow),
        storedRow,
        verdict: storedRow
          ? "נמשכה ונשמרה כבר ב-CRM."
          : !isProposal
          ? `נמשכה אך סוגה אינו 'הצעת מחיר' (${cat.label}) — ולכן לא מיובאת למודול ההצעות.`
          : !inWindow
          ? "נמשכה והיא הצעת מחיר, אך תאריכה מעבר לחלון 14 הימים → הסנכרון מדלג עליה."
          : "נמשכה, היא הצעת מחיר בתוך החלון, אך לא נשמרה — כנראה כשל שקט ביצירה (createQuoteFromSumit עטוף ב-catch).",
      };
    }
  }

  return NextResponse.json({
    scanMeta,
    stored: { quotes: storedQuotes, documents: storedDocuments },
    byType: Object.values(histogram).sort((a, b) => b.count - a.count),
    proposalsTotal: proposals.length,
    proposalsLast14d,
    recent,
    ...(lookup !== undefined ? { lookup } : {}),
  });
});
