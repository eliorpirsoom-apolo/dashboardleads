import { addMonths, eachDayOfInterval, format, subDays } from "date-fns";
import { prisma } from "./prisma";
import { buildComparison } from "./dates";
import {
  fetchGa4DailySessions,
  fetchSearchConsoleDaily,
  fetchSearchConsoleQueries,
  hasGoogleCredentials,
  type DailyMetric,
  type QueryMetric,
} from "./google";
import {
  mockGa4DailySessions,
  mockSearchConsoleDaily,
  mockSearchConsoleQueries,
} from "./seoMock";
import type {
  ImprovedKeyword,
  SeoReport,
  SeoSeriesPoint,
  SeoTaskDTO,
} from "./seoTypes";

// Search Console data lags ~2-3 days; end the window a few days back so the most
// recent days aren't shown as artificially empty.
const FRESHNESS_OFFSET_DAYS = 3;
const PERIOD_DAYS = 60;

function ymd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function dateList(from: Date, to: Date): string[] {
  return eachDayOfInterval({ start: from, end: to }).map(ymd);
}

// Overlay the current period on the previous period, aligned by day index.
function buildSeries(
  currentDates: string[],
  previousDates: string[],
  currentMap: Map<string, number>,
  previousMap: Map<string, number>
): SeoSeriesPoint[] {
  return currentDates.map((date, i) => ({
    dayIndex: i + 1,
    date,
    current: currentMap.get(date) ?? 0,
    previous: previousMap.get(previousDates[i]) ?? 0,
  }));
}

function impressionWeightedPosition(rows: DailyMetric[]): number {
  const totalImpr = rows.reduce((s, r) => s + r.impressions, 0);
  if (totalImpr === 0) return 0;
  const weighted = rows.reduce((s, r) => s + r.position * r.impressions, 0);
  return weighted / totalImpr;
}

// Queries whose average position climbed the most between the two periods.
function computeImprovedKeywords(
  current: QueryMetric[],
  previous: QueryMetric[],
  limit = 10
): ImprovedKeyword[] {
  const prevByQuery = new Map(previous.map((q) => [q.query, q]));
  const improved: ImprovedKeyword[] = [];

  for (const cur of current) {
    const prev = prevByQuery.get(cur.query);
    // Need a meaningful baseline in both periods to call it a real climb.
    if (!prev || cur.impressions < 30 || prev.position <= 0) continue;
    const positionDelta = prev.position - cur.position; // positive => climbed
    if (positionDelta <= 0.5) continue;
    improved.push({
      query: cur.query,
      currentPosition: +cur.position.toFixed(1),
      previousPosition: +prev.position.toFixed(1),
      positionDelta: +positionDelta.toFixed(1),
      clicks: Math.round(cur.clicks),
      impressions: Math.round(cur.impressions),
    });
  }

  improved.sort((a, b) => b.positionDelta - a.positionDelta);
  return improved.slice(0, limit);
}

async function loadTasks(
  clientId: string,
  thisMonth: string,
  nextMonth: string
): Promise<{ tasksDone: SeoTaskDTO[]; tasksPlanned: SeoTaskDTO[] }> {
  const tasks = await prisma.seoTask.findMany({
    where: {
      clientId,
      OR: [
        { status: "done", dueMonth: thisMonth },
        { status: "planned", dueMonth: nextMonth },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  const toDTO = (t: (typeof tasks)[number]): SeoTaskDTO => ({
    id: t.id,
    title: t.title,
    status: t.status === "done" ? "done" : "planned",
    dueMonth: t.dueMonth,
  });

  return {
    tasksDone: tasks.filter((t) => t.status === "done").map(toDTO),
    tasksPlanned: tasks.filter((t) => t.status === "planned").map(toDTO),
  };
}

export interface ClientLike {
  id: string;
  name: string;
  gscProperty: string | null;
  ga4PropertyId: string | null;
}

// Build the full organic SEO report for a client: 60-day Search Console and
// Analytics trends vs the prior 60 days, keywords that climbed, and the
// manually-entered task lists. Falls back to demo data per-source when live
// Google data is unavailable (missing credentials/property or an API error).
export async function buildSeoReport(
  client: ClientLike,
  now = new Date()
): Promise<SeoReport> {
  const endDate = subDays(now, FRESHNESS_OFFSET_DAYS);
  const curFrom = subDays(endDate, PERIOD_DAYS - 1);
  const prevTo = subDays(curFrom, 1);
  const prevFrom = subDays(prevTo, PERIOD_DAYS - 1);

  const currentDates = dateList(curFrom, endDate);
  const previousDates = dateList(prevFrom, prevTo);

  const creds = hasGoogleCredentials();

  // --- Search Console -----------------------------------------------------
  let gscCurrent: DailyMetric[];
  let gscPrevious: DailyMetric[];
  let queriesCurrent: QueryMetric[];
  let queriesPrevious: QueryMetric[];
  let gscSource: "live" | "demo" = "demo";

  if (creds && client.gscProperty) {
    try {
      [gscCurrent, gscPrevious, queriesCurrent, queriesPrevious] =
        await Promise.all([
          fetchSearchConsoleDaily(client.gscProperty, ymd(curFrom), ymd(endDate)),
          fetchSearchConsoleDaily(client.gscProperty, ymd(prevFrom), ymd(prevTo)),
          fetchSearchConsoleQueries(client.gscProperty, ymd(curFrom), ymd(endDate)),
          fetchSearchConsoleQueries(client.gscProperty, ymd(prevFrom), ymd(prevTo)),
        ]);
      gscSource = "live";
    } catch (err) {
      console.error("[seo] Search Console fetch failed, using demo data:", err);
      gscCurrent = mockSearchConsoleDaily(client.name, curFrom, endDate, endDate);
      gscPrevious = mockSearchConsoleDaily(client.name, prevFrom, prevTo, endDate);
      queriesCurrent = mockSearchConsoleQueries(client.name, true);
      queriesPrevious = mockSearchConsoleQueries(client.name, false);
    }
  } else {
    gscCurrent = mockSearchConsoleDaily(client.name, curFrom, endDate, endDate);
    gscPrevious = mockSearchConsoleDaily(client.name, prevFrom, prevTo, endDate);
    queriesCurrent = mockSearchConsoleQueries(client.name, true);
    queriesPrevious = mockSearchConsoleQueries(client.name, false);
  }

  // --- Analytics ----------------------------------------------------------
  let gaCurrent: { date: string; sessions: number }[];
  let gaPrevious: { date: string; sessions: number }[];
  let gaSource: "live" | "demo" = "demo";

  if (creds && client.ga4PropertyId) {
    try {
      [gaCurrent, gaPrevious] = await Promise.all([
        fetchGa4DailySessions(client.ga4PropertyId, ymd(curFrom), ymd(endDate)),
        fetchGa4DailySessions(client.ga4PropertyId, ymd(prevFrom), ymd(prevTo)),
      ]);
      gaSource = "live";
    } catch (err) {
      console.error("[seo] GA4 fetch failed, using demo data:", err);
      gaCurrent = mockGa4DailySessions(client.name, curFrom, endDate, endDate);
      gaPrevious = mockGa4DailySessions(client.name, prevFrom, prevTo, endDate);
    }
  } else {
    gaCurrent = mockGa4DailySessions(client.name, curFrom, endDate, endDate);
    gaPrevious = mockGa4DailySessions(client.name, prevFrom, prevTo, endDate);
  }

  // --- Series + KPIs ------------------------------------------------------
  const curClicks = new Map(gscCurrent.map((r) => [r.date, r.clicks]));
  const prevClicks = new Map(gscPrevious.map((r) => [r.date, r.clicks]));
  const curImpr = new Map(gscCurrent.map((r) => [r.date, r.impressions]));
  const prevImpr = new Map(gscPrevious.map((r) => [r.date, r.impressions]));
  const curSess = new Map(gaCurrent.map((r) => [r.date, r.sessions]));
  const prevSess = new Map(gaPrevious.map((r) => [r.date, r.sessions]));

  const sum = (m: Map<string, number>) =>
    Array.from(m.values()).reduce((s, v) => s + v, 0);

  const avgPosCur = +impressionWeightedPosition(gscCurrent).toFixed(1);
  const avgPosPrev = +impressionWeightedPosition(gscPrevious).toFixed(1);

  const thisMonth = format(now, "yyyy-MM");
  const nextMonth = format(addMonths(now, 1), "yyyy-MM");
  const { tasksDone, tasksPlanned } = await loadTasks(
    client.id,
    thisMonth,
    nextMonth
  );

  return {
    client: {
      id: client.id,
      name: client.name,
      gscProperty: client.gscProperty,
      ga4PropertyId: client.ga4PropertyId,
    },
    periodDays: PERIOD_DAYS,
    currentRange: { from: ymd(curFrom), to: ymd(endDate) },
    previousRange: { from: ymd(prevFrom), to: ymd(prevTo) },
    source: { gsc: gscSource, ga: gaSource },
    kpis: {
      clicks: buildComparison(sum(curClicks), sum(prevClicks)),
      impressions: buildComparison(sum(curImpr), sum(prevImpr)),
      avgPosition: buildComparison(avgPosCur, avgPosPrev),
      sessions: buildComparison(sum(curSess), sum(prevSess)),
    },
    gscClicksTrend: buildSeries(currentDates, previousDates, curClicks, prevClicks),
    gscImpressionsTrend: buildSeries(currentDates, previousDates, curImpr, prevImpr),
    gaSessionsTrend: buildSeries(currentDates, previousDates, curSess, prevSess),
    improvedKeywords: computeImprovedKeywords(queriesCurrent, queriesPrevious),
    thisMonth,
    nextMonth,
    tasksDone,
    tasksPlanned,
  };
}

// Helper for the tasks API: the "this month" / "next month" the report uses.
export function reportMonths(now = new Date()): {
  thisMonth: string;
  nextMonth: string;
} {
  return {
    thisMonth: format(now, "yyyy-MM"),
    nextMonth: format(addMonths(now, 1), "yyyy-MM"),
  };
}
