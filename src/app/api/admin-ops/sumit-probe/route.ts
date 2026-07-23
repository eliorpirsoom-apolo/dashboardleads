import { NextResponse } from "next/server";
import { sumitCall, sumitConfigured } from "@/lib/integrations/sumit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// אבחון חד-פעמי: מגלה את המבנה המדויק של SUMIT API. מוגן ב-CRON_SECRET.
// מחזיר סטטוס + מפתחות התשובה (בלי לשפוך PII). מוסר אחרי האימות.
function shape(v: any, depth = 0): any {
  if (v === null || typeof v !== "object") return typeof v;
  if (Array.isArray(v)) return [`array(${v.length})`, v[0] !== undefined && depth < 3 ? shape(v[0], depth + 1) : undefined];
  if (depth >= 3) return "object";
  const out: Record<string, any> = {};
  for (const k of Object.keys(v).slice(0, 40)) out[k] = shape(v[k], depth + 1);
  return out;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!sumitConfigured()) {
    return NextResponse.json({ error: "SUMIT not configured" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const email: string | undefined = body.email;

  // 1) אילו סוגי מסמכים (Type) קיימים בחשבון + דוגמה לכל סוג.
  const list = await sumitCall<any>("/accounting/documents/list/", { Page: 1 });
  const docs: any[] = list.data?.Documents ?? [];
  const byType: Record<string, { count: number; sampleNumber: number; sampleId: number }> = {};
  for (const d of docs) {
    const t = String(d.Type);
    if (!byType[t]) byType[t] = { count: 0, sampleNumber: d.DocumentNumber, sampleId: d.DocumentID };
    byType[t].count++;
  }

  // 2) getdetails על מסמך ראשון — אולי יש שם תווית סוג.
  let detailsShape: any = null;
  if (docs[0]?.DocumentID) {
    const det = await sumitCall<any>("/accounting/documents/getdetails/", { DocumentID: docs[0].DocumentID });
    detailsShape = { status: det.status, ok: det.ok, error: det.error, shape: det.data ? shape(det.data) : null };
  }

  // 3) חיפוש/רשימת לקוחות לפי מייל — כמה וריאנטים.
  const custAttempts: { path: string; body: Record<string, unknown> }[] = [
    { path: "/accounting/customers/list/", body: { Page: 1 } },
    { path: "/accounting/customers/getcustomers/", body: { Search: email } },
    { path: "/accounting/customers/get/", body: { Search: email } },
    { path: "/accounting/customers/getopenbalances/", body: {} },
  ];
  const customers: any[] = [];
  if (email) {
    for (const a of custAttempts) {
      try {
        const r = await sumitCall<any>(a.path, a.body);
        customers.push({ path: a.path, body: Object.keys(a.body), httpStatus: r.status, ok: r.ok, error: r.error, dataShape: r.data ? shape(r.data) : null });
      } catch (e) {
        customers.push({ path: a.path, exception: String(e).slice(0, 150) });
      }
    }
  }

  // מייל לדוגמה של לקוח SUMIT — לאימות התאמה (QA).
  let sampleEmail: string | null = null;
  let sampleName: string | null = null;
  if (docs[0]?.DocumentID) {
    const { sumitDocumentEmail } = await import("@/lib/integrations/sumit");
    sampleEmail = await sumitDocumentEmail(docs[0].DocumentID);
    sampleName = docs[0].CustomerName ?? null;
  }

  return NextResponse.json({
    documentTypes: byType,
    totalOnPage: docs.length,
    detailsShape,
    customerSearch: customers,
    sampleEmail,
    sampleName,
  });
}
