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

  // ננסה וריאנטים של גוף הבקשה כדי לגרום להצעות מחיר/טיוטות להופיע.
  const { sumitCall } = await import("@/lib/integrations/sumit");
  const variants: { name: string; body: Record<string, unknown> }[] = [
    { name: "default", body: { Page: 1 } },
    { name: "IncludeDrafts", body: { Page: 1, IncludeDrafts: true } },
    { name: "Type=11(quote)", body: { Page: 1, Type: 11 } },
    { name: "Types=[11]", body: { Page: 1, Types: [11] } },
    { name: "DocumentType=11", body: { Page: 1, DocumentType: 11 } },
    { name: "DraftsOnly", body: { Page: 1, Draft: true } },
  ];
  const variantResults: any[] = [];
  for (const v of variants) {
    const r = await sumitCall<{ Documents: any[] }>("/accounting/documents/list/", v.body);
    const ds = r.data?.Documents ?? [];
    const types = [...new Set(ds.map((d: any) => d.Type))];
    variantResults.push({
      variant: v.name,
      ok: r.ok,
      error: r.error,
      count: ds.length,
      types,
      hasEitanName: ds.some((d: any) => String(d.CustomerName || "").toLowerCase().includes("eitan") || String(d.CustomerName || "").includes("smart")),
    });
  }

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

  return NextResponse.json({ totalDocs: docs.length, typeSummary, matchesForEmail: matches, variantResults });
}
