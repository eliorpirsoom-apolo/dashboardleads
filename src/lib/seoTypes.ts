// Types for the organic SEO client report (Search Console + Analytics + tasks).

export type DataSourceKind = "live" | "demo";

// A single day aligned between the current period and the equal-length period
// immediately before it. `dayIndex` (1..N) lets the two periods overlay on one
// axis even though their calendar dates differ.
export interface SeoSeriesPoint {
  dayIndex: number;
  date: string; // the current-period calendar date (yyyy-MM-dd)
  current: number;
  previous: number;
}

// "value now vs the previous equal-length period" comparison.
export interface SeoMetric {
  value: number;
  previousValue: number;
  delta: number; // value - previousValue
  deltaPercent: number | null; // null when previousValue === 0
  direction: "up" | "down" | "flat";
}

// A query whose average Google position improved (moved up) between the
// previous period and the current one.
export interface ImprovedKeyword {
  query: string;
  currentPosition: number;
  previousPosition: number;
  // previousPosition - currentPosition; positive means the term climbed.
  positionDelta: number;
  clicks: number;
  impressions: number;
}

export interface SeoTaskDTO {
  id: string;
  title: string;
  status: "done" | "planned";
  dueMonth: string; // yyyy-MM
}

export interface SeoClientDTO {
  id: string;
  name: string;
  gscProperty: string | null;
  ga4PropertyId: string | null;
}

export interface SeoReport {
  client: SeoClientDTO;
  periodDays: number;
  currentRange: { from: string; to: string }; // yyyy-MM-dd
  previousRange: { from: string; to: string }; // yyyy-MM-dd
  // Where each data set came from, so the UI can flag demo data.
  source: { gsc: DataSourceKind; ga: DataSourceKind };
  kpis: {
    clicks: SeoMetric;
    impressions: SeoMetric;
    avgPosition: SeoMetric; // NOTE: lower is better
    sessions: SeoMetric;
  };
  // Day-by-day series (current period overlaid on the previous period).
  gscClicksTrend: SeoSeriesPoint[];
  gscImpressionsTrend: SeoSeriesPoint[];
  gaSessionsTrend: SeoSeriesPoint[];
  improvedKeywords: ImprovedKeyword[];
  // Resolved for the report's month context.
  thisMonth: string; // yyyy-MM
  nextMonth: string; // yyyy-MM
  tasksDone: SeoTaskDTO[]; // status "done", this month
  tasksPlanned: SeoTaskDTO[]; // status "planned", next month
}
