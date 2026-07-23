import { NextResponse } from "next/server";
import { sumitConfigured, sumitListDocuments, sumitDocumentEmail, sumitDocType } from "@/lib/integrations/sumit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// אבחון ממוקד: מאתר מסמך לפי מייל הלקוח ומחזיר את הסוג. מוגן ב-CRON_SECRET.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!sumitConfigured()) return NextResponse.json({ error: "not configured" }, { status: 400 });

  const { email } = await req.json().catch(() => ({}));
  const docs = await sumitListDocuments();

  // סיכום סוגים בכל החשבון.
  const typeSummary: Record<string, { count: number; label: string; category: string; sample: number }> = {};
  for (const d of docs) {
    const t = String(d.Type);
    const m = sumitDocType(d.Type);
    if (!typeSummary[t]) typeSummary[t] = { count: 0, label: m.label, category: m.category, sample: d.DocumentNumber };
    typeSummary[t].count++;
  }

  // מסמכים של המייל המבוקש (התאמה דרך getdetails).
  const matches: any[] = [];
  if (email) {
    for (const d of docs) {
      const e = await sumitDocumentEmail(d.DocumentID);
      if (e === email.toLowerCase().trim()) {
        matches.push({
          DocumentNumber: d.DocumentNumber,
          Type: d.Type,
          mapped: sumitDocType(d.Type),
          CustomerName: d.CustomerName,
          value: d.DocumentValue,
        });
      }
    }
  }

  return NextResponse.json({ totalDocs: docs.length, typeSummary, matchesForEmail: matches });
}
