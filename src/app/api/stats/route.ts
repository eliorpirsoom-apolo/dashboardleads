import { NextResponse } from "next/server";
import { parseQuery } from "@/lib/query";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

// GET /api/stats?preset=last7&campaign=<id|all>[&from=&to=]
// Returns all KPIs, trend series, breakdowns and regressions for the dashboard.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { preset, range, campaignId } = parseQuery(searchParams);
    const stats = await getStats(range, preset, campaignId);
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[api/stats]", err);
    return NextResponse.json(
      { error: "Failed to compute stats" },
      { status: 500 }
    );
  }
}
