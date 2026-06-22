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
        receivedAt: lead.receivedAt.toISOString(),
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

  // --- Demo SEO client + tasks (organic SEO report) -----------------------
  console.log("[seed] Generating demo SEO client + tasks…");
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const thisMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;

  const client = await prisma.client.upsert({
    where: { name: "משרד עו״ד דוגמה" },
    // No live Google properties -> the report renders demo Search Console/GA data.
    create: { name: "משרד עו״ד דוגמה" },
    update: {},
  });

  // Refresh the demo tasks so re-seeding stays idempotent.
  await prisma.seoTask.deleteMany({ where: { clientId: client.id } });
  await prisma.seoTask.createMany({
    data: [
      { clientId: client.id, status: "done", dueMonth: thisMonth, title: "אופטימיזציית תוכן לעמודי שירות מרכזיים" },
      { clientId: client.id, status: "done", dueMonth: thisMonth, title: "בניית 8 קישורים נכנסים איכותיים" },
      { clientId: client.id, status: "done", dueMonth: thisMonth, title: "שיפור מהירות טעינה ו-Core Web Vitals" },
      { clientId: client.id, status: "done", dueMonth: thisMonth, title: "כתיבת 3 מאמרי בלוג ממוקדי ביטויים" },
      { clientId: client.id, status: "planned", dueMonth: nextMonth, title: "הרחבת אשכול תוכן לתחום הגירושין" },
      { clientId: client.id, status: "planned", dueMonth: nextMonth, title: "אופטימיזציה לכוונת חיפוש מקומית (Local SEO)" },
      { clientId: client.id, status: "planned", dueMonth: nextMonth, title: "תיקון שגיאות סריקה וקישורים שבורים" },
      { clientId: client.id, status: "planned", dueMonth: nextMonth, title: "בניית 10 קישורים נכנסים נוספים" },
    ],
  });

  console.log(
    `[seed] Done — ${created} leads across ${campaignCache.size} campaigns; 1 SEO client + 8 tasks.`
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[seed] Failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
