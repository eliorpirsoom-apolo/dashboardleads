import { JWT } from "google-auth-library";
import { readFileSync } from "node:fs";
import { format } from "date-fns";
import type {
  DateRange,
  SeoMetric,
  SeoPageRow,
  SeoQueryRow,
  SeoReportData,
} from "./types";

// ---------------------------------------------------------------------------
// Google Search Console — Search Analytics
//
// Pulls organic-search performance (clicks, impressions, CTR, average
// position, top queries, top pages) for the SEO report. Authentication uses a
// Google Cloud **service account**:
//
//   1. Create a service account in Google Cloud and enable the
//      "Google Search Console API".
//   2. In Search Console, add the service-account email as a user on the
//      property (Settings → Users and permissions).
//   3. Provide the JSON key via GOOGLE_SC_CREDENTIALS_JSON (inline) or
//      GOOGLE_SC_CREDENTIALS_PATH (file path), and set SC_SITE_URL.
//
// When credentials are absent the module falls back to realistic mock data so
// the report stays demonstrable — mirroring the scraper's mock fallback.
// ---------------------------------------------------------------------------

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API_BASE = "https://www.googleapis.com/webmasters/v3/sites";

const ROW_LIMIT = 250; // pulled per dimension; the report renders a subset.
const TOP_N = 10; // rows shown in the report tables.
const MIN_IMPRESSIONS_FOR_MOVER = 20; // ignore noise when ranking movers.

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/** True when a property URL and service-account credentials are configured. */
export function seoConfigured(): boolean {
  return Boolean(siteUrl() && loadCredentials());
}

export function siteUrl(): string {
  return process.env.SC_SITE_URL ?? "";
}

function loadCredentials(): ServiceAccountKey | null {
  const inline = process.env.GOOGLE_SC_CREDENTIALS_JSON;
  const path =
    process.env.GOOGLE_SC_CREDENTIALS_PATH ??
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  try {
    const raw = inline
      ? inline
      : path
      ? readFileSync(path, "utf8")
      : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ServiceAccountKey;
    if (!parsed.client_email || !parsed.private_key) return null;
    // Allow keys whose newlines were escaped when pasted into an env var.
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return parsed;
  } catch (err) {
    console.error("[seo] Failed to load Search Console credentials:", err);
    return null;
  }
}

function authClient(creds: ServiceAccountKey): JWT {
  return new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [SCOPE],
  });
}

// --- Raw API ---------------------------------------------------------------

interface SearchAnalyticsRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface QueryBody {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
}

async function querySearchAnalytics(
  client: JWT,
  site: string,
  body: QueryBody
): Promise<SearchAnalyticsRow[]> {
  const url = `${API_BASE}/${encodeURIComponent(site)}/searchAnalytics/query`;
  const res = await client.request<{ rows?: SearchAnalyticsRow[] }>({
    url,
    method: "POST",
    data: body,
  });
  return res.data.rows ?? [];
}

function isoDay(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd");
}

/** A query with no dimensions returns a single totals row (or none if empty). */
function totals(rows: SearchAnalyticsRow[]): SearchAnalyticsRow {
  return rows[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
}

// --- Metric assembly -------------------------------------------------------

function buildMetric(
  key: SeoMetric["key"],
  label: string,
  value: number,
  previousValue: number,
  lowerIsBetter = false
): SeoMetric {
  const delta = value - previousValue;
  const deltaPercent =
    previousValue === 0 ? null : (delta / previousValue) * 100;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return {
    key,
    label,
    value,
    previousValue,
    delta,
    deltaPercent,
    direction,
    lowerIsBetter,
  };
}

function summaryMetrics(
  cur: SearchAnalyticsRow,
  prev: SearchAnalyticsRow
): SeoMetric[] {
  return [
    buildMetric("clicks", "קליקים", cur.clicks, prev.clicks),
    buildMetric("impressions", "חשיפות", cur.impressions, prev.impressions),
    buildMetric("ctr", "CTR", cur.ctr, prev.ctr),
    buildMetric("position", "מיקום ממוצע", cur.position, prev.position, true),
  ];
}

// Join current query rows against previous-period positions to surface movers.
function rankMovers(
  current: SearchAnalyticsRow[],
  previous: SearchAnalyticsRow[]
): { rising: SeoQueryRow[]; declining: SeoQueryRow[] } {
  const prevPos = new Map<string, number>();
  for (const r of previous) {
    if (r.keys?.[0]) prevPos.set(r.keys[0], r.position);
  }

  const withDelta: SeoQueryRow[] = current
    .filter((r) => r.keys?.[0] && r.impressions >= MIN_IMPRESSIONS_FOR_MOVER)
    .map((r) => {
      const before = prevPos.get(r.keys![0]);
      return {
        query: r.keys![0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
        positionDelta: before === undefined ? null : r.position - before,
      };
    })
    .filter((r) => r.positionDelta !== null);

  // Negative positionDelta = moved up the rankings (improved).
  const rising = [...withDelta]
    .sort((a, b) => (a.positionDelta ?? 0) - (b.positionDelta ?? 0))
    .filter((r) => (r.positionDelta ?? 0) < 0)
    .slice(0, TOP_N);
  const declining = [...withDelta]
    .sort((a, b) => (b.positionDelta ?? 0) - (a.positionDelta ?? 0))
    .filter((r) => (r.positionDelta ?? 0) > 0)
    .slice(0, TOP_N);

  return { rising, declining };
}

function toQueryRows(rows: SearchAnalyticsRow[]): SeoQueryRow[] {
  return rows
    .filter((r) => r.keys?.[0])
    .slice(0, TOP_N)
    .map((r) => ({
      query: r.keys![0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
      positionDelta: null,
    }));
}

function toPageRows(
  rows: SearchAnalyticsRow[],
  prev: SearchAnalyticsRow[]
): SeoPageRow[] {
  const prevClicks = new Map<string, number>();
  for (const r of prev) if (r.keys?.[0]) prevClicks.set(r.keys[0], r.clicks);
  return rows
    .filter((r) => r.keys?.[0])
    .slice(0, TOP_N)
    .map((r) => {
      const before = prevClicks.get(r.keys![0]);
      return {
        page: r.keys![0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
        clicksDelta: before === undefined ? null : r.clicks - before,
      };
    });
}

// --- Public entrypoint -----------------------------------------------------

export interface FetchSeoReportOptions {
  range: DateRange;
  previousRange: DateRange;
  presetLabel: string;
  clientName: string;
  generatedAt: string;
}

/**
 * Build the full SEO report dataset for a period. Hits the Search Console API
 * when configured, otherwise returns realistic mock data (isMock: true).
 */
export async function fetchSeoReport(
  opts: FetchSeoReportOptions
): Promise<SeoReportData> {
  const creds = loadCredentials();
  const site = siteUrl();

  if (!creds || !site) {
    console.log(
      "[seo] No Search Console credentials/site configured — using mock data."
    );
    return mockSeoReport(opts);
  }

  try {
    const client = authClient(creds);
    const cur = { startDate: isoDay(opts.range.from), endDate: isoDay(opts.range.to) };
    const prv = {
      startDate: isoDay(opts.previousRange.from),
      endDate: isoDay(opts.previousRange.to),
    };

    const [
      curTotals,
      prevTotals,
      curQueries,
      prevQueries,
      curPages,
      prevPages,
    ] = await Promise.all([
      querySearchAnalytics(client, site, { ...cur }),
      querySearchAnalytics(client, site, { ...prv }),
      querySearchAnalytics(client, site, { ...cur, dimensions: ["query"], rowLimit: ROW_LIMIT }),
      querySearchAnalytics(client, site, { ...prv, dimensions: ["query"], rowLimit: ROW_LIMIT }),
      querySearchAnalytics(client, site, { ...cur, dimensions: ["page"], rowLimit: ROW_LIMIT }),
      querySearchAnalytics(client, site, { ...prv, dimensions: ["page"], rowLimit: ROW_LIMIT }),
    ]);

    const { rising, declining } = rankMovers(curQueries, prevQueries);

    return {
      siteUrl: site,
      clientName: opts.clientName,
      range: opts.range,
      previousRange: opts.previousRange,
      presetLabel: opts.presetLabel,
      generatedAt: opts.generatedAt,
      isMock: false,
      summary: summaryMetrics(totals(curTotals), totals(prevTotals)),
      topQueries: toQueryRows(curQueries),
      risingQueries: rising,
      decliningQueries: declining,
      topPages: toPageRows(curPages, prevPages),
    };
  } catch (err) {
    console.error("[seo] Search Console request failed — falling back to mock:", err);
    return mockSeoReport(opts);
  }
}

// --- Mock fallback ---------------------------------------------------------

// Deterministic-ish placeholder data so the report renders end-to-end without
// credentials. Numbers are plausible for a small/mid Israeli business site.
function mockSeoReport(opts: FetchSeoReportOptions): SeoReportData {
  const queries = [
    "אינסטלטור תל אביב",
    "פתיחת סתימות",
    "תיקון דוד שמש",
    "אינסטלטור 24 שעות",
    "החלפת ברז",
    "נזילת מים בקיר",
    "אינסטלטור מומלץ",
    "ביוב סתום מחיר",
    "התקנת אסלה",
    "אינסטלטור באזור המרכז",
    "תיקון נזילה דחוף",
    "שירותי אינסטלציה",
  ];
  const pages = [
    "/",
    "/services/blockages",
    "/services/water-heater",
    "/contact",
    "/about",
    "/services/emergency",
    "/blog/nezilot",
    "/services/installation",
  ];

  const topQueries: SeoQueryRow[] = queries.map((q, i) => {
    const impressions = 1800 - i * 120;
    const position = 3.2 + i * 0.9;
    const ctr = Math.max(0.012, 0.085 - i * 0.006);
    return {
      query: q,
      clicks: Math.round(impressions * ctr),
      impressions,
      ctr,
      position: Number(position.toFixed(1)),
      positionDelta: Number((((i % 5) - 2) * 1.3).toFixed(1)),
    };
  });

  const risingQueries = [...topQueries]
    .map((q, i) => ({ ...q, positionDelta: -1 * (3.4 - i * 0.4) }))
    .filter((q) => (q.positionDelta ?? 0) < 0)
    .slice(0, 5);
  const decliningQueries = [...topQueries]
    .slice(6)
    .map((q, i) => ({ ...q, positionDelta: 1.2 + i * 0.7 }))
    .slice(0, 4);

  const topPages: SeoPageRow[] = pages.map((p, i) => {
    const impressions = 4200 - i * 380;
    const ctr = Math.max(0.02, 0.07 - i * 0.005);
    return {
      page: p,
      clicks: Math.round(impressions * ctr),
      impressions,
      ctr,
      position: Number((4 + i * 1.1).toFixed(1)),
      clicksDelta: Math.round((((i % 4) - 1) * 18)),
    };
  });

  const curClicks = topPages.reduce((s, p) => s + p.clicks, 0);
  const curImpr = topPages.reduce((s, p) => s + p.impressions, 0);
  const curCtr = curClicks / curImpr;

  return {
    siteUrl: siteUrl() || "https://example.co.il/",
    clientName: opts.clientName,
    range: opts.range,
    previousRange: opts.previousRange,
    presetLabel: opts.presetLabel,
    generatedAt: opts.generatedAt,
    isMock: true,
    summary: [
      buildMetric("clicks", "קליקים", curClicks, Math.round(curClicks * 0.84)),
      buildMetric("impressions", "חשיפות", curImpr, Math.round(curImpr * 0.91)),
      buildMetric("ctr", "CTR", curCtr, curCtr * 0.93),
      buildMetric("position", "מיקום ממוצע", 6.4, 7.9, true),
    ],
    topQueries,
    risingQueries,
    decliningQueries,
    topPages,
  };
}
