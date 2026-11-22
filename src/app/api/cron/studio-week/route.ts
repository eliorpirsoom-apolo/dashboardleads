import { NextResponse } from "next/server";
import { openCurrentWeekGroup } from "@/lib/studioWeek";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 🗓️ פתיחת קבוצת-שבוע בסטודיו — יום ראשון מוקדם בבוקר (vercel.json).
// יוצר את קבוצת השבוע הנוכחי (אם עוד אין) ומושך אליה את כל המשימות הפתוחות.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await openCurrentWeekGroup();
  return NextResponse.json({ ok: true, ...r });
}
