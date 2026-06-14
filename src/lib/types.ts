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
