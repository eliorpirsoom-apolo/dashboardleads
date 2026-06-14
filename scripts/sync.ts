/**
 * Standalone sync entrypoint — suitable for a cron job:
 *
 *   # every 30 minutes
 *   * /30 * * * * cd /path/to/dashboardleads && npm run scrape >> sync.log 2>&1
 *
 * Run manually:
 *   npm run scrape          # headless
 *   npm run scrape:headed   # visible browser (debug selectors)
 */
import "dotenv/config";
import { runSync } from "../src/lib/sync";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log(`[sync] Starting at ${new Date().toISOString()}`);
  const summary = await runSync();
  console.log(`[sync] ${summary.message}`);
  if (summary.alertTriggered) {
    console.log(`[sync] ⚠️ Flagged campaigns: ${summary.flaggedCampaigns.join(", ")}`);
  }
  await prisma.$disconnect();
  process.exit(summary.status === "success" ? 0 : 1);
}

main().catch(async (err) => {
  console.error("[sync] Fatal error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
