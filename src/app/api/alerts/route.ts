import { NextResponse } from "next/server";
import { detectRegressions, alertThresholdPercent } from "@/lib/stats";
import { sendRegressionAlert } from "@/lib/email";

export const dynamic = "force-dynamic";

// GET /api/alerts?campaign=<id|all>
// Returns week-over-week regression results + the configured threshold.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaign") || "all";
    const regressions = await detectRegressions(campaignId);
    return NextResponse.json({
      threshold: alertThresholdPercent(),
      regressions,
      flagged: regressions.filter((r) => r.isRegression),
    });
  } catch (err) {
    console.error("[api/alerts]", err);
    return NextResponse.json(
      { error: "Failed to evaluate alerts" },
      { status: 500 }
    );
  }
}

// POST /api/alerts — manually (re)send the regression email alert. Handy for
// testing SMTP configuration without waiting for a sync.
export async function POST() {
  const regressions = await detectRegressions();
  const threshold = alertThresholdPercent();
  const sent = await sendRegressionAlert(regressions, threshold);
  return NextResponse.json({
    sent,
    flagged: regressions.filter((r) => r.isRegression).length,
    emailEnabled: process.env.EMAIL_ENABLED === "true",
  });
}
