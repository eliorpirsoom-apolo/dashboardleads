import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Meta (Facebook) Ads adapter — fills the spec items:
//   - "וואטסאפים: כמות התחלות התכתבות ממנהל המודעות"
//   - "2 המודעות החזקות של החודש" (auto)
//   - Auto campaign/audience/ad attribution arrives via Lead Ads payloads.
//
// Requires a per-client Integration row (kind="meta") with config:
//   { adAccountId: "act_XXXX", accessToken: "EAAG..." }
// Connected by the agency in the client's settings (see CONNECTIONS.md).
// ---------------------------------------------------------------------------

interface MetaConfig {
  adAccountId: string;
  accessToken: string;
}

export async function getMetaConfig(clientId: string): Promise<MetaConfig | null> {
  const integration = await prisma.integration.findUnique({
    where: { clientId_kind: { clientId, kind: "meta" } },
  });
  if (!integration || integration.status !== "connected" || !integration.config) {
    return null;
  }
  try {
    const cfg = JSON.parse(integration.config);
    if (cfg.adAccountId && cfg.accessToken) return cfg;
  } catch {}
  return null;
}

/**
 * Pull campaign insights for a month from the Graph API and upsert AdInsight
 * rows: whatsapp conversation starts, leads, spend, impressions per campaign.
 * Also auto-fills the month's Top-2 ads by lead count.
 */
export async function syncMetaInsights(
  clientId: string,
  month: string // "2026-07"
): Promise<{ campaigns: number; topAdsUpdated: boolean }> {
  const cfg = await getMetaConfig(clientId);
  if (!cfg) {
    throw new Error("חיבור Meta לא מוגדר ללקוח (הגדרות ⟵ אינטגרציות)");
  }

  const [y, m] = month.split("-").map(Number);
  const since = `${month}-01`;
  const until = new Date(y, m, 0).toISOString().slice(0, 10); // month end

  const params = new URLSearchParams({
    level: "campaign",
    fields: "campaign_name,spend,impressions,actions",
    time_range: JSON.stringify({ since, until }),
    limit: "100",
    access_token: cfg.accessToken,
  });
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${cfg.adAccountId}/insights?${params}`
  );
  if (!res.ok) {
    const text = await res.text();
    await prisma.integration.update({
      where: { clientId_kind: { clientId, kind: "meta" } },
      data: { status: "error", lastError: text.slice(0, 500) },
    });
    throw new Error(`Meta API שגיאה ${res.status}`);
  }
  const data = (await res.json()) as { data: any[] };

  let count = 0;
  for (const row of data.data ?? []) {
    const actions: { action_type: string; value: string }[] = row.actions ?? [];
    const whatsapp = Number(
      actions.find((a) =>
        a.action_type.includes("messaging_conversation_started")
      )?.value ?? 0
    );
    const leads = Number(
      actions.find((a) => a.action_type === "lead")?.value ?? 0
    );

    await prisma.adInsight.upsert({
      where: {
        clientId_month_source_campaignName: {
          clientId,
          month,
          source: "meta",
          campaignName: row.campaign_name ?? "—",
        },
      },
      create: {
        clientId,
        month,
        source: "meta",
        campaignName: row.campaign_name ?? "—",
        whatsappCount: whatsapp,
        leadsCount: leads,
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
      },
      update: {
        whatsappCount: whatsapp,
        leadsCount: leads,
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
      },
    });
    count++;
  }

  // Auto Top-2 ads of the month by lead count (spec: "2 המודעות החזקות").
  const top = await prisma.adInsight.findMany({
    where: { clientId, month, source: "meta" },
    orderBy: { leadsCount: "desc" },
    take: 2,
  });
  for (let i = 0; i < top.length; i++) {
    const t = top[i];
    const cpl = t.leadsCount > 0 ? (t.spend / t.leadsCount).toFixed(0) : null;
    await prisma.topAd.upsert({
      where: { clientId_month_rank: { clientId, month, rank: i + 1 } },
      create: {
        clientId,
        month,
        rank: i + 1,
        name: t.campaignName,
        platform: "facebook",
        metric: `${t.leadsCount} לידים${cpl ? ` · ${cpl} ₪ לליד` : ""}`,
        notes: "עודכן אוטומטית ממנהל המודעות",
      },
      update: {
        name: t.campaignName,
        metric: `${t.leadsCount} לידים${cpl ? ` · ${cpl} ₪ לליד` : ""}`,
        notes: "עודכן אוטומטית ממנהל המודעות",
      },
    });
  }

  await prisma.integration.update({
    where: { clientId_kind: { clientId, kind: "meta" } },
    data: { lastSyncAt: new Date(), lastError: null, status: "connected" },
  });

  return { campaigns: count, topAdsUpdated: top.length > 0 };
}
