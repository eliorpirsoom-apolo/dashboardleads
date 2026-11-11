import { NextResponse } from "next/server";
import { touchCronHeartbeat } from "@/lib/health";
import { findThreadsNeedingDraft, generateSocialDraft } from "@/lib/social/drafts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// רשת ביטחון לטיוטות AI של תיבת המענה — כל 5 דקות. הטיוטה נוצרת בדרך כלל
// מיד בקליטה (webhook); הקרון משלים פניות שנשארו בלי טיוטה (timeout, שגיאה
// זמנית, ריבוי אירועים בבקשה אחת) ומרענן טיוטות שהתיישנו (הגולש כתב שוב).
// ---------------------------------------------------------------------------

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await touchCronHeartbeat("social-drafts");
  const ids = await findThreadsNeedingDraft(10);
  const results: Record<string, string> = {};
  for (const id of ids) {
    const r = await generateSocialDraft(id);
    results[id] = r.status + (r.reason ? ` (${r.reason})` : "");
  }
  return NextResponse.json({ ok: true, processed: ids.length, results });
}
