import { prisma } from "./prisma";
import { scrapeLeads } from "@/scraper/leadManager";
import type { ScrapedLead } from "@/scraper/types";
import { detectRegressions, alertThresholdPercent } from "./stats";
import { sendRegressionAlert } from "./email";

export interface SyncSummary {
  syncLogId: string;
  status: "success" | "error";
  live: boolean;
  leadsFound: number;
  leadsCreated: number;
  leadsUpdated: number;
  alertTriggered: boolean;
  flaggedCampaigns: string[];
  message: string;
}

/** Find-or-create a campaign by its (unique) name, with an in-run cache. */
async function resolveCampaignId(
  name: string,
  cache: Map<string, string>
): Promise<string> {
  const key = name || "Unknown Campaign";
  const cached = cache.get(key);
  if (cached) return cached;

  const campaign = await prisma.campaign.upsert({
    where: { name: key },
    create: { name: key },
    update: {},
  });
  cache.set(key, campaign.id);
  return campaign.id;
}

/** Upsert scraped leads into the DB, returning created/updated counts. */
async function persistLeads(leads: ScrapedLead[]) {
  const campaignCache = new Map<string, string>();
  let created = 0;
  let updated = 0;

  for (const lead of leads) {
    const campaignId = await resolveCampaignId(lead.campaignName, campaignCache);

    // Incremental upsert keyed on the Lead Manager external id.
    const existing = await prisma.lead.findUnique({
      where: { externalId: lead.externalId },
      select: { id: true },
    });

    await prisma.lead.upsert({
      where: { externalId: lead.externalId },
      create: {
        externalId: lead.externalId,
        campaignId,
        receivedAt: lead.receivedAt,
        status: lead.status,
        source: lead.source,
      },
      update: {
        campaignId,
        receivedAt: lead.receivedAt,
        status: lead.status,
        source: lead.source,
      },
    });

    if (existing) updated++;
    else created++;
  }

  return { created, updated };
}

/**
 * Full sync pipeline:
 *   1. Open a SyncLog row.
 *   2. Scrape leads (live or mock).
 *   3. Upsert campaigns + leads incrementally.
 *   4. Run week-over-week regression detection.
 *   5. Send an email alert if a significant drop is detected.
 *   6. Close out the SyncLog.
 */
export async function runSync(): Promise<SyncSummary> {
  const log = await prisma.syncLog.create({ data: { status: "running" } });

  try {
    const { leads, live } = await scrapeLeads();
    const { created, updated } = await persistLeads(leads);

    // Regression detection across all campaigns.
    const regressions = await detectRegressions();
    const threshold = alertThresholdPercent();
    const flagged = regressions.filter((r) => r.isRegression);
    const alertTriggered = flagged.length > 0;

    // Fire email alert (no-op if disabled or nothing flagged).
    await sendRegressionAlert(regressions, threshold);

    const message =
      `Sync ${live ? "(live)" : "(mock)"} complete: ${leads.length} found, ` +
      `${created} created, ${updated} updated.` +
      (alertTriggered
        ? ` ⚠️ ${flagged.length} campaign(s) flagged for ≥${threshold}% drop.`
        : "");

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        leadsFound: leads.length,
        leadsCreated: created,
        leadsUpdated: updated,
        alertTriggered,
        message,
      },
    });

    return {
      syncLogId: log.id,
      status: "success",
      live,
      leadsFound: leads.length,
      leadsCreated: created,
      leadsUpdated: updated,
      alertTriggered,
      flaggedCampaigns: flagged.map((f) => f.campaign),
      message,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "error", finishedAt: new Date(), message },
    });
    console.error("[sync] Failed:", err);
    return {
      syncLogId: log.id,
      status: "error",
      live: false,
      leadsFound: 0,
      leadsCreated: 0,
      leadsUpdated: 0,
      alertTriggered: false,
      flaggedCampaigns: [],
      message,
    };
  }
}
