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

/** Split an array into fixed-size chunks (keeps us under SQLite's bind-var limit). */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Persist scraped leads efficiently with bulk inserts.
 *
 * A naive per-row upsert means thousands of round trips to a remote database
 * (Turso), which easily exceeds serverless time limits. Instead we:
 *   1. Resolve campaigns once (cached).
 *   2. Look up which externalIds already exist (chunked `IN` queries).
 *   3. Bulk-insert brand-new leads via createMany (chunked).
 *   4. Update only the leads whose data actually changed.
 * On a first sync this is a handful of queries instead of thousands.
 */
async function persistLeads(leads: ScrapedLead[]) {
  const campaignCache = new Map<string, string>();

  // 1. Resolve every campaign up front (only ~N distinct DB writes).
  for (const lead of leads) {
    await resolveCampaignId(lead.campaignName, campaignCache);
  }

  const rows = leads.map((lead) => ({
    externalId: lead.externalId,
    campaignId: campaignCache.get(lead.campaignName || "Unknown Campaign")!,
    receivedAt: lead.receivedAt.toISOString(),
    status: lead.status,
    source: lead.source,
  }));

  // 2. Find existing leads for this batch (chunked to respect bind-var limits).
  const existing = new Map<
    string,
    { status: string; source: string; receivedAt: string; campaignId: string }
  >();
  for (const ids of chunk(rows.map((r) => r.externalId), 400)) {
    const found = await prisma.lead.findMany({
      where: { externalId: { in: ids } },
      select: {
        externalId: true,
        status: true,
        source: true,
        receivedAt: true,
        campaignId: true,
      },
    });
    for (const f of found) existing.set(f.externalId, f);
  }

  const toCreate = rows.filter((r) => !existing.has(r.externalId));
  const toUpdate = rows.filter((r) => {
    const e = existing.get(r.externalId);
    return (
      e !== undefined &&
      (e.status !== r.status ||
        e.source !== r.source ||
        e.receivedAt !== r.receivedAt ||
        e.campaignId !== r.campaignId)
    );
  });

  // 3. Bulk insert new leads (100 rows/insert keeps params well under limits).
  for (const batch of chunk(toCreate, 100)) {
    await prisma.lead.createMany({ data: batch });
  }

  // 4. Update only the leads that actually changed (usually few/none).
  for (const r of toUpdate) {
    await prisma.lead.update({
      where: { externalId: r.externalId },
      data: {
        campaignId: r.campaignId,
        receivedAt: r.receivedAt,
        status: r.status,
        source: r.source,
      },
    });
  }

  return { created: toCreate.length, updated: toUpdate.length };
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
