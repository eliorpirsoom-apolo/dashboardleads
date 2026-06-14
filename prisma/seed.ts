/**
 * Seed the SQLite cache with realistic demo data so the dashboard is fully
 * functional without live Lead Manager credentials. The generated data includes
 * a deliberate week-over-week drop on one campaign to demonstrate the
 * regression detection + alerting UI.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { generateMockLeads } from "../src/scraper/mock";

async function main() {
  console.log("[seed] Generating demo leads…");
  const leads = generateMockLeads(60);

  const campaignCache = new Map<string, string>();
  let created = 0;

  for (const lead of leads) {
    let campaignId = campaignCache.get(lead.campaignName);
    if (!campaignId) {
      const campaign = await prisma.campaign.upsert({
        where: { name: lead.campaignName },
        create: { name: lead.campaignName },
        update: {},
      });
      campaignId = campaign.id;
      campaignCache.set(lead.campaignName, campaignId);
    }

    await prisma.lead.upsert({
      where: { externalId: lead.externalId },
      create: {
        externalId: lead.externalId,
        campaignId,
        receivedAt: lead.receivedAt,
        status: lead.status,
        source: lead.source,
      },
      update: {},
    });
    created++;
  }

  await prisma.syncLog.create({
    data: {
      status: "success",
      finishedAt: new Date(),
      leadsFound: leads.length,
      leadsCreated: created,
      message: `Seeded ${created} demo leads across ${campaignCache.size} campaigns.`,
    },
  });

  console.log(
    `[seed] Done — ${created} leads across ${campaignCache.size} campaigns.`
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[seed] Failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
