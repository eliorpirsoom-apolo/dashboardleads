import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId } from "@/lib/api";
import { ilMonthStart } from "@/lib/time";
import { allowedProjectIds } from "@/lib/projectScope";

export const dynamic = "force-dynamic";

// GET /api/reports/summary?clientId&from&to&projectId
// The client-facing periodic report: leads by channel/campaign/status,
// budget vs spend + CPL, contracts value, inventory (real-estate).
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));

  const now = new Date();
  const from = p.get("from")
    ? new Date(p.get("from")!)
    : ilMonthStart(now);
  const to = p.get("to") ? new Date(`${p.get("to")}T23:59:59`) : now;
  // סוכן-פרויקטים: הדוח תמיד בגבולות הפרויקטים שלו.
  const allowed = await allowedProjectIds(user);
  let projectId = p.get("projectId") || undefined;
  if (allowed && projectId && !allowed.includes(projectId)) projectId = undefined;
  const projFilter = projectId
    ? { projectId }
    : allowed
      ? { projectId: { in: allowed } }
      : {};

  const leadWhere = {
    clientId,
    archived: false,
    receivedAt: { gte: from, lte: to },
    ...projFilter,
  };

  const [totalLeads, byChannel, byCampaign, byStatus, byKind, contracts, budgets, projects] =
    await Promise.all([
      prisma.lead.count({ where: leadWhere }),
      prisma.lead.groupBy({
        by: ["channel"],
        where: leadWhere,
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["campaignId", "campaignLabel"],
        where: leadWhere,
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["statusId"],
        where: leadWhere,
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["kind"],
        where: leadWhere,
        _count: { _all: true },
      }),
      prisma.contract.findMany({
        where: {
          clientId,
          createdAt: { gte: from, lte: to },
          ...projFilter,
        },
        select: { value: true },
      }),
      prisma.budget.findMany({
        where: { clientId, ...(projectId ? { projectId } : {}) },
      }),
      prisma.project.findMany({
        where: {
          clientId,
          ...(projectId ? { id: projectId } : allowed ? { id: { in: allowed } } : {}),
        },
        include: { unitTypes: true },
      }),
    ]);

  // Resolve display names for grouped ids.
  const [statuses, campaigns] = await Promise.all([
    prisma.leadStatus.findMany({ where: { clientId } }),
    prisma.campaign.findMany({ where: { clientId } }),
  ]);
  const statusMap = Object.fromEntries(statuses.map((s) => [s.id, s]));
  const campaignMap = Object.fromEntries(campaigns.map((c) => [c.id, c.name]));

  // Ad-platform insights (Meta) for months overlapping the range —
  // fills the spec item "וואטסאפים ממנהל המודעות" in the client report.
  const fromKey = from.toISOString().slice(0, 7);
  const toKey = to.toISOString().slice(0, 7);
  const adInsights = await prisma.adInsight.findMany({
    where: { clientId, month: { gte: fromKey, lte: toKey } },
    orderBy: [{ month: "desc" }, { leadsCount: "desc" }],
  });
  const inRange = budgets.filter(
    (b) => b.period === "monthly" && b.periodKey >= fromKey && b.periodKey <= toKey
  );
  const totalBudget = inRange.reduce((s, b) => s + b.amount, 0);
  const totalSpend = inRange.reduce((s, b) => s + b.spend, 0);

  const won = byStatus.reduce(
    (s, g) =>
      s + (g.statusId && statusMap[g.statusId]?.systemKind === "won" ? g._count._all : 0),
    0
  );

  return NextResponse.json({
    range: { from, to },
    totals: {
      leads: totalLeads,
      won,
      conversion: totalLeads > 0 ? (won / totalLeads) * 100 : 0,
      budget: totalBudget,
      spend: totalSpend,
      cpl: totalLeads > 0 && totalSpend > 0 ? totalSpend / totalLeads : null,
      contractsCount: contracts.length,
      contractsValue: contracts.reduce((s, c) => s + c.value, 0),
    },
    byChannel: byChannel
      .map((g) => ({ channel: g.channel, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    byCampaign: byCampaign
      .map((g) => ({
        name: (g.campaignId && campaignMap[g.campaignId]) || g.campaignLabel || "ללא קמפיין",
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    byStatus: byStatus
      .map((g) => ({
        name: g.statusId ? statusMap[g.statusId]?.name ?? "—" : "ללא סטטוס",
        color: g.statusId ? statusMap[g.statusId]?.color ?? "#64748b" : "#64748b",
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    byKind: byKind.map((g) => ({ kind: g.kind, count: g._count._all })),
    inventory: projects.map((pr) => ({
      project: pr.name,
      total: pr.unitTypes.reduce((s, u) => s + u.totalUnits, 0),
      sold: pr.unitTypes.reduce((s, u) => s + u.soldUnits, 0),
    })),
    adInsights: {
      totalWhatsapp: adInsights.reduce((s, a) => s + a.whatsappCount, 0),
      totalSpend: adInsights.reduce((s, a) => s + a.spend, 0),
      campaigns: adInsights.map((a) => ({
        month: a.month,
        campaignName: a.campaignName,
        whatsappCount: a.whatsappCount,
        leadsCount: a.leadsCount,
        spend: a.spend,
        impressions: a.impressions,
      })),
    },
  });
});
