import { NextResponse } from "next/server";
import { runWeeklyBackupSafe } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// 💾 גיבוי שבועי — ראשון 02:00 UTC (05:00 IL), vercel.json.

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runWeeklyBackupSafe());
}
