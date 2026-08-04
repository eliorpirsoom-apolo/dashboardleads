import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { sumitListDocuments, sumitDocType } from "@/lib/integrations/sumit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/integrations/sumit/diagnose — אבחון: פילוח סוגי מסמכים + המסמכים
// האחרונים, כדי לזהות באיזה סוג הצעות המחיר מונפקות ב-SUMIT. מנהל בלבד.
export const GET = handle(async () => {
  await requireManager();
  const docs = await sumitListDocuments();
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const histogram: Record<string, { type: number; category: string; label: string; count: number }> = {};
  for (const d of docs) {
    const { category, label } = sumitDocType(d.Type);
    const key = String(d.Type);
    if (!histogram[key]) histogram[key] = { type: d.Type, category, label, count: 0 };
    histogram[key].count++;
  }

  const recent = [...docs]
    .filter((d) => d.Date)
    .sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime())
    .slice(0, 15)
    .map((d) => ({
      number: d.DocumentNumber,
      type: d.Type,
      label: sumitDocType(d.Type).label,
      category: sumitDocType(d.Type).category,
      date: d.Date?.slice(0, 10),
      value: d.DocumentValue,
      customer: d.CustomerName,
    }));

  const proposals = docs.filter((d) => sumitDocType(d.Type).category === "proposal");
  const proposalsLast14d = proposals.filter((d) => d.Date && new Date(d.Date) >= cutoff).length;

  // מה *נשמר* בפועל ב-CRM מ-SUMIT (בניגוד למה שרק נסרק).
  const [storedQuotes, storedDocuments] = await Promise.all([
    prisma.quote.count({ where: { notes: { contains: "[sumit:" } } }),
    prisma.document.count({ where: { provider: "sumit" } }),
  ]);

  return NextResponse.json({
    scannedFromSumit: docs.length, // נסרק בלבד (קריאה) — לא נשמר
    stored: { quotes: storedQuotes, documents: storedDocuments }, // מה שבאמת נשמר במערכת
    byType: Object.values(histogram).sort((a, b) => b.count - a.count),
    proposalsTotal: proposals.length,
    proposalsLast14d,
    recent,
  });
});
