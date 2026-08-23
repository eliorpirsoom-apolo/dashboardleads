import { NextResponse } from "next/server";
import { runHealthCheck, touchCronHeartbeat } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// בדיקת בריאות מלאה — פעמיים ביום (vercel.json). תקלות → וואטסאפ + מייל.

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await touchCronHeartbeat("health");
  const result = await runHealthCheck();
  return NextResponse.json(result);
}
