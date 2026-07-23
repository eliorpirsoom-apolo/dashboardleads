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

  // ננסה כמה endpoints סבירים ונחזיר את מה שנענה.
  const attempts: { path: string; body: Record<string, unknown> }[] = [
    { path: "/accounting/documents/list/", body: { Page: 1 } },
    { path: "/accounting/documents/getdocuments/", body: {} },
    { path: "/accounting/customers/getcustomers/", body: email ? { EmailAddress: email } : {} },
    { path: "/website/customers/get/", body: email ? { EmailAddress: email } : {} },
  ];

  const results: any[] = [];
  for (const a of attempts) {
    try {
      const r = await sumitCall(a.path, a.body);
      results.push({
        path: a.path,
        httpStatus: r.status,
        ok: r.ok,
        error: r.error,
        dataShape: r.data ? shape(r.data) : null,
      });
    } catch (e) {
      results.push({ path: a.path, exception: String(e).slice(0, 200) });
    }
  }
  return NextResponse.json({ results });
}
