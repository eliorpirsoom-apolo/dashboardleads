import { NextResponse } from "next/server";
import { sumitConfigured } from "@/lib/integrations/sumit";
import { syncSumit } from "@/lib/integrations/sumitSync";
import { touchCronHeartbeat } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// 📄 סנכרון SUMIT — קרון עצמאי כל 15 דקות (vercel.json).
// הופרד מקרון התזכורות כדי שלא יתחרה על תקציב ה-60 שניות עם משימות כבדות
// (תמלולים וכו') — מה שגרם להצעות מחיר להגיע באיחור/להתפספס.
// ---------------------------------------------------------------------------

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await touchCronHeartbeat("sumit");
  if (!sumitConfigured()) return NextResponse.json({ skipped: "not-configured" });
  try {
    const result = await syncSumit();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron:sumit]", err);
    return NextResponse.json({ ok: false, error: String(err).slice(0, 300) });
  }
}
