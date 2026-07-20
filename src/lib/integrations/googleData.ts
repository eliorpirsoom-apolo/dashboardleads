import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Google data integrations (per client): Search Console + GA4.
// Uses the same Google OAuth app as the login (extra scopes, offline access).
// Refresh tokens live in the Integration row; access tokens are refreshed
// on demand. Daily sync fills SeoSnapshot + SeoKeywordRank.
// ---------------------------------------------------------------------------

const SECRET =
  process.env.AUTH_SECRET || "dev-insecure-secret-change-me-in-production";

export const GOOGLE_SCOPES: Record<string, string> = {
  search_console: "https://www.googleapis.com/auth/webmasters.readonly",
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  // יומן אישי של עובד משרד — קריאת כל היומנים + כתיבת אירועים (דו-כיווני).
  calendar: "https://www.googleapis.com/auth/calendar",
};

/** Signed state for the connect flow: clientId + kind, tamper-proof. */
export function packState(clientId: string, kind: string): string {
  const payload = `${clientId}.${kind}.${Date.now()}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 24);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function unpackState(
  state: string
): { clientId: string; kind: string } | null {
  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    const [clientId, kind, ts, sig] = raw.split(".");
    const payload = `${clientId}.${kind}.${ts}`;
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(payload)
      .digest("hex")
      .slice(0, 24);
    if (sig !== expected) return null;
    if (Date.now() - Number(ts) > 15 * 60 * 1000) return null;
    return { clientId, kind };
  } catch {
    return null;
  }
}

/** Get a fresh access token for a connected integration. */
export async function accessTokenFor(integrationId: string): Promise<string> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  });
  if (!integration?.refreshToken) {
    throw new Error("אין refresh token — חברו מחדש את החשבון");
  }
  // Reuse a still-valid access token.
  if (
    integration.accessToken &&
    integration.expiresAt &&
    integration.expiresAt.getTime() > Date.now() + 60_000
  ) {
    return integration.accessToken;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: integration.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`רענון טוקן גוגל נכשל (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });
  return data.access_token;
}

function cfg(integration: { config: string | null }): Record<string, string> {
  try {
    return integration.config ? JSON.parse(integration.config) : {};
  } catch {
    return {};
  }
}

/** Sync Search Console daily rows (clicks/impressions/position) + keyword ranks. */
export async function syncSearchConsole(
  clientId: string,
  days = 3
): Promise<number> {
  const integration = await prisma.integration.findUnique({
    where: { clientId_kind: { clientId, kind: "search_console" } },
  });
  if (!integration || integration.status !== "connected") {
    throw new Error("Search Console לא מחובר ללקוח");
  }
  const siteUrl = cfg(integration).siteUrl;
  if (!siteUrl) throw new Error("חסרה כתובת אתר (siteUrl) בהגדרות החיבור");

  const token = await accessTokenFor(integration.id);
  const end = new Date(Date.now() - 24 * 60 * 60 * 1000); // GSC lags ~1 day
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Daily totals
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: fmt(start),
        endDate: fmt(end),
        dimensions: ["date"],
        rowLimit: 100,
      }),
    }
  );
  if (!res.ok) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: "error", lastError: `GSC ${res.status}` },
    });
    throw new Error(`Search Console שגיאה ${res.status}`);
  }
  const data = (await res.json()) as { rows?: any[] };
  let count = 0;
  for (const row of data.rows ?? []) {
    const date = row.keys[0];
    await prisma.seoSnapshot.upsert({
      where: {
        clientId_date_source: { clientId, date, source: "search_console" },
      },
      create: {
        clientId,
        date,
        source: "search_console",
        clicks: Math.round(row.clicks ?? 0),
        impressions: Math.round(row.impressions ?? 0),
        position: row.position ?? null,
      },
      update: {
        clicks: Math.round(row.clicks ?? 0),
        impressions: Math.round(row.impressions ?? 0),
        position: row.position ?? null,
      },
    });
    count++;
  }

  // Tracked keyword positions
  const keywords = await prisma.seoKeyword.findMany({
    where: { clientId, active: true },
  });
  if (keywords.length > 0) {
    const kwRes = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: fmt(start),
          endDate: fmt(end),
          dimensions: ["query"],
          rowLimit: 1000,
        }),
      }
    );
    if (kwRes.ok) {
      const kwData = (await kwRes.json()) as { rows?: any[] };
      const byQuery = new Map(
        (kwData.rows ?? []).map((r) => [String(r.keys[0]).toLowerCase(), r])
      );
      const date = fmt(end);
      for (const kw of keywords) {
        const row = byQuery.get(kw.keyword.toLowerCase());
        if (!row) continue;
        await prisma.seoKeywordRank.upsert({
          where: { keywordId_date: { keywordId: kw.id, date } },
          create: {
            keywordId: kw.id,
            date,
            position: row.position ?? 0,
            clicks: Math.round(row.clicks ?? 0),
            impressions: Math.round(row.impressions ?? 0),
          },
          update: {
            position: row.position ?? 0,
            clicks: Math.round(row.clicks ?? 0),
            impressions: Math.round(row.impressions ?? 0),
          },
        });
      }
    }
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: { lastSyncAt: new Date(), lastError: null, status: "connected" },
  });
  return count;
}

/** Sync GA4 daily sessions/users/conversions. */
export async function syncGa4(clientId: string, days = 3): Promise<number> {
  const integration = await prisma.integration.findUnique({
    where: { clientId_kind: { clientId, kind: "ga4" } },
  });
  if (!integration || integration.status !== "connected") {
    throw new Error("Google Analytics לא מחובר ללקוח");
  }
  const propertyId = cfg(integration).propertyId;
  if (!propertyId) throw new Error("חסר Property ID בהגדרות החיבור");

  const token = await accessTokenFor(integration.id);
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "conversions" },
        ],
      }),
    }
  );
  if (!res.ok) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: "error", lastError: `GA4 ${res.status}` },
    });
    throw new Error(`GA4 שגיאה ${res.status}`);
  }
  const data = (await res.json()) as { rows?: any[] };
  let count = 0;
  for (const row of data.rows ?? []) {
    const raw = row.dimensionValues[0].value as string; // "20260713"
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    await prisma.seoSnapshot.upsert({
      where: { clientId_date_source: { clientId, date, source: "ga4" } },
      create: {
        clientId,
        date,
        source: "ga4",
        sessions: Number(row.metricValues[0].value ?? 0),
        users: Number(row.metricValues[1].value ?? 0),
        conversions: Number(row.metricValues[2].value ?? 0),
      },
      update: {
        sessions: Number(row.metricValues[0].value ?? 0),
        users: Number(row.metricValues[1].value ?? 0),
        conversions: Number(row.metricValues[2].value ?? 0),
      },
    });
    count++;
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: { lastSyncAt: new Date(), lastError: null, status: "connected" },
  });
  return count;
}
