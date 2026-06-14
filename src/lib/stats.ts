import { prisma } from "./prisma";
import {
  buildComparison,
  comparisonRange,
  daysInRange,
  rangeLengthDays,
} from "./dates";
import type {
  DatePreset,
  DateRange,
  NamedCount,
  RegressionResult,
  StatsResponse,
  TrendPoint,
} from "./types";
import { Prisma } from "@prisma/client";
import { startOfDay, subDays } from "date-fns";

// Statuses that count as a "conversion" for the conversion-rate KPI.
// Matched case-insensitively as substrings (covers EN + common Hebrew terms).
const CONVERTED_STATUS_KEYWORDS = [
  "convert",
  "won",
  "sold",
  "closed",
  "deal",
  "qualified",
  "נמכר", // sold
  "עסקה", // deal
  "נסגר", // closed
];

function isConverted(status: string): boolean {
  const s = status.toLowerCase();
  return CONVERTED_STATUS_KEYWORDS.some((k) => s.includes(k.toLowerCase()));
}

/** Default alert threshold (percent drop) — overridable via env. */
export function alertThresholdPercent(): number {
  const raw = Number(process.env.ALERT_DROP_THRESHOLD_PERCENT);
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}

// Build the Prisma `where` clause for a range + optional campaign filter.
function whereForRange(range: DateRange, campaignId?: string) {
  // receivedAt is an ISO-8601 UTC string; range.from/to are already ISO, so
  // we compare strings directly (chronologically correct, adapter-safe).
  const where: Prisma.LeadWhereInput = {
    receivedAt: { gte: range.from, lte: range.to },
  };
  if (campaignId && campaignId !== "all") {
    where.campaignId = campaignId;
  }
  return where;
}

/** Total lead count for a range. */
async function countLeads(range: DateRange, campaignId?: string) {
  return prisma.lead.count({ where: whereForRange(range, campaignId) });
}

/** Number of converted leads for a range. */
async function countConverted(range: DateRange, campaignId?: string) {
  const leads = await prisma.lead.findMany({
    where: whereForRange(range, campaignId),
    select: { status: true },
  });
  return leads.filter((l) => isConverted(l.status)).length;
}

/** Distinct campaigns that received at least one lead in the range. */
async function countActiveCampaigns(range: DateRange, campaignId?: string) {
  const rows = await prisma.lead.findMany({
    where: whereForRange(range, campaignId),
    select: { campaignId: true },
    distinct: ["campaignId"],
  });
  return rows.length;
}

/** Daily trend series for the range (zero-filled). */
async function leadsTrend(
  range: DateRange,
  campaignId?: string
): Promise<TrendPoint[]> {
  const leads = await prisma.lead.findMany({
    where: whereForRange(range, campaignId),
    select: { receivedAt: true },
  });

  const counts = new Map<string, number>();
  for (const day of daysInRange(range)) counts.set(day, 0);
  for (const lead of leads) {
    // receivedAt is ISO-8601 UTC; the first 10 chars are the yyyy-MM-dd day.
    const key = lead.receivedAt.slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([date, leadsCount]) => ({
    date,
    leads: leadsCount,
  }));
}

/** Group leads by an arbitrary field into a sorted NamedCount[]. */
async function groupBy(
  field: "campaignId" | "status" | "source",
  range: DateRange,
  campaignId?: string
): Promise<NamedCount[]> {
  const grouped = await prisma.lead.groupBy({
    by: [field],
    where: whereForRange(range, campaignId),
    _count: { _all: true },
  });

  // Resolve campaign IDs to names for the campaign breakdown.
  let nameMap = new Map<string, string>();
  if (field === "campaignId") {
    const campaigns = await prisma.campaign.findMany({
      select: { id: true, name: true },
    });
    nameMap = new Map(campaigns.map((c) => [c.id, c.name]));
  }

  return grouped
    .map((g) => {
      const raw = (g as Record<string, unknown>)[field] as string;
      return {
        name: field === "campaignId" ? nameMap.get(raw) ?? "Unknown" : raw,
        value: g._count._all,
      };
    })
    .sort((a, b) => b.value - a.value);
}

/**
 * Detect week-over-week regressions per campaign. Compares the trailing 7 days
 * against the 7 days before that. A campaign is flagged when its lead volume
 * drops by at least the configured threshold (and it had a meaningful baseline).
 */
export async function detectRegressions(
  campaignId?: string,
  now = new Date()
): Promise<RegressionResult[]> {
  const threshold = alertThresholdPercent();

  const currentWeek: DateRange = {
    from: startOfDay(subDays(now, 6)).toISOString(),
    to: now.toISOString(),
  };
  const previousWeek: DateRange = {
    from: startOfDay(subDays(now, 13)).toISOString(),
    to: startOfDay(subDays(now, 7)).toISOString(),
  };

  const campaigns = await prisma.campaign.findMany({
    where: campaignId && campaignId !== "all" ? { id: campaignId } : undefined,
    select: { id: true, name: true },
  });

  const results: RegressionResult[] = [];
  for (const c of campaigns) {
    const [cur, prev] = await Promise.all([
      countLeads(currentWeek, c.id),
      countLeads(previousWeek, c.id),
    ]);

    // Drop percent relative to the previous week.
    const dropPercent =
      prev === 0 ? (cur === 0 ? 0 : -100) : ((prev - cur) / prev) * 100;

    // Only flag campaigns with a non-trivial baseline to avoid noise.
    const isRegression = prev >= 3 && dropPercent >= threshold;

    results.push({
      campaignId: c.id,
      campaign: c.name,
      currentWeek: cur,
      previousWeek: prev,
      dropPercent: Math.round(dropPercent * 10) / 10,
      isRegression,
    });
  }

  // Surface the worst drops first.
  return results.sort((a, b) => b.dropPercent - a.dropPercent);
}

/**
 * Aggregate everything the dashboard needs for a given range + campaign,
 * including period-over-period comparisons.
 */
export async function getStats(
  range: DateRange,
  preset: DatePreset | undefined,
  campaignId?: string
): Promise<StatsResponse> {
  const { previous } = comparisonRange(range, preset);

  const [
    totalCur,
    totalPrev,
    convCur,
    convPrev,
    activeCur,
    activePrev,
    trend,
    byCampaign,
    bySource,
    byStatus,
    regressions,
  ] = await Promise.all([
    countLeads(range, campaignId),
    countLeads(previous, campaignId),
    countConverted(range, campaignId),
    countConverted(previous, campaignId),
    countActiveCampaigns(range, campaignId),
    countActiveCampaigns(previous, campaignId),
    leadsTrend(range, campaignId),
    groupBy("campaignId", range, campaignId),
    groupBy("source", range, campaignId),
    groupBy("status", range, campaignId),
    detectRegressions(campaignId),
  ]);

  const curDays = rangeLengthDays(range);
  const prevDays = rangeLengthDays(previous);
  const avgCur = curDays > 0 ? totalCur / curDays : 0;
  const avgPrev = prevDays > 0 ? totalPrev / prevDays : 0;

  const convRateCur = totalCur > 0 ? (convCur / totalCur) * 100 : 0;
  const convRatePrev = totalPrev > 0 ? (convPrev / totalPrev) * 100 : 0;

  return {
    range,
    previousRange: previous,
    kpis: {
      totalLeads: buildComparison(totalCur, totalPrev),
      activeCampaigns: buildComparison(activeCur, activePrev),
      avgLeadsPerDay: buildComparison(
        Math.round(avgCur * 10) / 10,
        Math.round(avgPrev * 10) / 10
      ),
      conversionRate: buildComparison(
        Math.round(convRateCur * 10) / 10,
        Math.round(convRatePrev * 10) / 10
      ),
    },
    trend,
    byCampaign,
    bySource,
    byStatus,
    regressions,
    alertThresholdPercent: alertThresholdPercent(),
  };
}
