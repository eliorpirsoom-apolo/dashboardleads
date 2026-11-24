import { NextResponse } from "next/server";
import { rolloverWeeklyTasks } from "@/lib/weeklyRollover";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 🗓️ גלגול "רשימת השבוע" של המשרד — יום ראשון מוקדם בבוקר (vercel.json).
// מושך קדימה לשבוע הנוכחי כל משימה שלא בוצעה משבועות קודמים.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await rolloverWeeklyTasks();
  return NextResponse.json({ ok: true, ...r });
}
