// Shared types used across the API, lib, and UI layers.

export type DatePreset =
  | "yesterday"
  | "last7"
  | "currentMonth"
  | "previousMonth"
  | "lastYear"
  | "custom";

// A resolved date range (inclusive start, exclusive end is handled in queries).
export interface DateRange {
  from: string; // ISO date string
  to: string; // ISO date string
}

// A range plus the immediately-preceding comparison range of equal length.
export interface ComparisonRange {
  current: DateRange;
  previous: DateRange;
}

// Generic "value now vs value before" comparison used by KPI cards.
export interface MetricComparison {
  value: number;
  previousValue: number;
  delta: number; // value - previousValue
  deltaPercent: number | null; // null when previousValue === 0
  direction: "up" | "down" | "flat";
}

export interface TrendPoint {
  date: string; // ISO date (day granularity)
  leads: number;
}

export interface NamedCount {
  name: string;
  value: number;
}

// Per-campaign week-over-week regression result.
export interface RegressionResult {
  campaignId: string;
  campaign: string;
  currentWeek: number;
  previousWeek: number;
  dropPercent: number; // positive number means a drop
  isRegression: boolean;
}

export interface StatsResponse {
  range: DateRange;
  previousRange: DateRange;
  kpis: {
    totalLeads: MetricComparison;
    activeCampaigns: MetricComparison;
    avgLeadsPerDay: MetricComparison;
    conversionRate: MetricComparison; // % of leads with a "converted"-like status
  };
  trend: TrendPoint[];
  byCampaign: NamedCount[];
  bySource: NamedCount[];
  byStatus: NamedCount[];
  regressions: RegressionResult[];
  alertThresholdPercent: number;
}

export interface LeadRow {
  id: string;
  externalId: string;
  campaign: string;
  receivedAt: string;
  status: string;
  source: string;
}

// ---------------------------------------------------------------------------
// Google organic (SEO) report
//
// Sourced from the Google Search Console "Search Analytics" API (with a mock
// fallback when no service-account credentials are configured). Powers the
// PDF report that gets emailed to the client.
// ---------------------------------------------------------------------------

// One headline metric (clicks, impressions, CTR, avg. position) with its
// period-over-period comparison. `lowerIsBetter` flips the sentiment so that a
// dropping average position is rendered as an improvement.
export interface SeoMetric {
  key: "clicks" | "impressions" | "ctr" | "position";
  label: string; // Hebrew display label
  value: number;
  previousValue: number;
  delta: number;
  deltaPercent: number | null;
  direction: "up" | "down" | "flat";
  lowerIsBetter: boolean;
}

// A single search query (keyword) row from Search Analytics.
export interface SeoQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number; // 0..1
  position: number;
  // Change in average position vs the comparison period (negative = improved).
  positionDelta: number | null;
}

// A landing page row from Search Analytics.
export interface SeoPageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number; // 0..1
  position: number;
  clicksDelta: number | null;
}

// Everything the report template needs to render one client report.
export interface SeoReportData {
  siteUrl: string;
  clientName: string;
  range: DateRange;
  previousRange: DateRange;
  presetLabel: string;
  generatedAt: string; // ISO
  // True when the figures are placeholder/mock data (no GSC credentials).
  isMock: boolean;
  summary: SeoMetric[];
  topQueries: SeoQueryRow[];
  risingQueries: SeoQueryRow[];
  decliningQueries: SeoQueryRow[];
  topPages: SeoPageRow[];
  // Organic leads attributed in the dashboard for the same period (optional).
  organicLeads?: MetricComparison;
}
