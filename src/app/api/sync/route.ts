import { NextResponse } from "next/server";
import { runSync } from "@/lib/sync";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
// Scraping can take a while — allow a generous execution window.
export const maxDuration = 300;

// POST /api/sync — trigger a scrape + persistence + regression/alert pass.
// Useful for a "Sync now" button or an external cron hitting the endpoint.
export async function POST() {
  const summary = await runSync();
  const status = summary.status === "success" ? 200 : 500;
  return NextResponse.json(summary, { status });
}

// GET /api/sync — return recent sync history for the UI status indicator.
export async function GET() {
  const logs = await prisma.syncLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 10,
  });
  return NextResponse.json({ logs });
}
