import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { getBucketCors, setBucketCors, r2Configured } from "@/lib/storage";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// CORS על דלי ה-R2 — נדרש כדי שהעלאות גדולות (presigned PUT ישירות מהדפדפן,
// למשל סרטונים בסטודיו) לא ייחסמו. GET מציג את הכללים הקיימים; POST מחיל
// כלל שמתיר PUT/GET מהאפליקציה (APP_BASE_URL).
// ---------------------------------------------------------------------------

export const GET = handle(async () => {
  await requireManager();
  return NextResponse.json({ r2: r2Configured(), rules: await getBucketCors() });
});

export const POST = handle(async () => {
  await requireManager();
  if (!r2Configured()) {
    return NextResponse.json({ ok: false, error: "R2 לא מוגדר בסביבה" }, { status: 400 });
  }
  const origins = [
    process.env.APP_BASE_URL || "https://app.apolloadv.co.il",
    "http://localhost:3000",
  ];
  await setBucketCors(origins);
  return NextResponse.json({ ok: true, origins, rules: await getBucketCors() });
});
