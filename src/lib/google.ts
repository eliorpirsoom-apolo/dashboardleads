import { google } from "googleapis";

// ---------------------------------------------------------------------------
// Google Search Console + GA4 integration.
//
// Auth uses a service account. Provide ONE of:
//   - GOOGLE_SERVICE_ACCOUNT_JSON  (the full JSON key, stringified)
//   - GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY  (private key may contain \n)
//
// The service account must be granted:
//   - "Full" or "Restricted" user on the Search Console property, and
//   - "Viewer" on the GA4 property (Admin -> Property Access Management).
//
// When credentials are absent every fetcher throws `MISSING_CREDENTIALS`, and
// the report layer falls back to demo data so the app stays demonstrable.
// ---------------------------------------------------------------------------

export const MISSING_CREDENTIALS = "MISSING_CREDENTIALS";

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

export function hasGoogleCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
      (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
  );
}

function getAuth() {
  if (!hasGoogleCredentials()) {
    throw new Error(MISSING_CREDENTIALS);
  }

  let credentials: { client_email: string; private_key: string };
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    credentials = {
      client_email: parsed.client_email,
      private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
    };
  } else {
    credentials = {
      client_email: process.env.GOOGLE_CLIENT_EMAIL as string,
      private_key: String(process.env.GOOGLE_PRIVATE_KEY).replace(/\\n/g, "\n"),
    };
  }

  return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
}

export interface DailyMetric {
  date: string; // yyyy-MM-dd
  clicks: number;
  impressions: number;
  position: number; // average position for that day
}

export interface QueryMetric {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

// --- Search Console -------------------------------------------------------

// Per-day clicks/impressions/position over [startDate, endDate] (inclusive).
export async function fetchSearchConsoleDaily(
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<DailyMetric[]> {
  const auth = getAuth();
  const webmasters = google.webmasters({ version: "v3", auth });
  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["date"],
      rowLimit: 1000,
    },
  });
  const rows = res.data.rows ?? [];
  return rows.map((r) => ({
    date: (r.keys?.[0] ?? "").slice(0, 10),
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    position: r.position ?? 0,
  }));
}

// Per-query clicks/impressions/position over a window (for keyword movement).
export async function fetchSearchConsoleQueries(
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<QueryMetric[]> {
  const auth = getAuth();
  const webmasters = google.webmasters({ version: "v3", auth });
  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 5000,
    },
  });
  const rows = res.data.rows ?? [];
  return rows.map((r) => ({
    query: r.keys?.[0] ?? "",
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    position: r.position ?? 0,
  }));
}

// --- GA4 ------------------------------------------------------------------

// Per-day sessions over [startDate, endDate] (inclusive).
export async function fetchGa4DailySessions(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<{ date: string; sessions: number }[]> {
  const auth = getAuth();
  const data = google.analyticsdata({ version: "v1beta", auth });
  const res = await data.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: "1000",
    },
  });
  const rows = res.data.rows ?? [];
  return rows.map((r) => {
    const raw = r.dimensionValues?.[0]?.value ?? ""; // "YYYYMMDD"
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    return { date, sessions: Number(r.metricValues?.[0]?.value ?? 0) };
  });
}
