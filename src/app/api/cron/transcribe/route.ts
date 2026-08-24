import { NextResponse } from "next/server";
import {
  downloadPendingRecordings,
  processPendingCallTranscriptions,
} from "@/lib/transcription";
import { touchCronHeartbeat } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// 🎙️ הקלטות + תמלול — קרון עצמאי כל 5 דקות (vercel.json).
// הופרד מקרון התזכורות: בבוקר עמוס שיחות, 2 תמלולים לריצה בתוך תקציב
// משותף של 60 שניות יצרו תור — כאן יש תקציב ייעודי (5 דק') וקיבולת גדולה.
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
  await touchCronHeartbeat("transcribe");

  // קודם שומרים כל הקלטה חדשה ל-R2 (בלי תלות במפתח תמלול), אז מתמללים.
  let recordings: unknown = null;
  try {
    recordings = await downloadPendingRecordings();
  } catch (err) {
    console.error("[cron:transcribe:recordings]", err);
  }
  let transcriptions: unknown = null;
  try {
    transcriptions = await processPendingCallTranscriptions(5);
  } catch (err) {
    console.error("[cron:transcribe]", err);
  }
  console.log(
    `[transcribe] recordings=${JSON.stringify(recordings)} transcriptions=${JSON.stringify(transcriptions)}`
  );
  return NextResponse.json({ recordings, transcriptions });
}
