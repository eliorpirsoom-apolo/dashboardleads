import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/seo/data?clientId&days=30 — everything the SEO dashboard needs.
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));
  const days = Math.min(180, Math.max(7, Number(p.get("days") || 30)));

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [snapshots, keywords, organicLeads, integrations] = await Promise.all([
    prisma.seoSnapshot.findMany({
      where: { clientId, date: { gte: since } },
      orderBy: { date: "asc" },
    }),
    prisma.seoKeyword.findMany({
      where: { clientId, active: true },
      include: {
        ranks: { orderBy: { date: "desc" }, take: 10 },
      },
    }),
    prisma.lead.count({
      where: {
        clientId,
        archived: false,
        channel: "organic",
        receivedAt: { gte: new Date(since) },
      },
    }),
    prisma.integration.findMany({
      where: { clientId, kind: { in: ["search_console", "ga4"] } },
      select: { kind: true, status: true, lastSyncAt: true, lastError: true },
    }),
  ]);

  return NextResponse.json({
    snapshots,
    keywords: keywords.map((k) => ({
      id: k.id,
      keyword: k.keyword,
      // current + trend: latest rank vs ~oldest of last 10
      current: k.ranks[0]?.position ?? null,
      previous: k.ranks[k.ranks.length - 1]?.position ?? null,
      lastDate: k.ranks[0]?.date ?? null,
      clicks: k.ranks[0]?.clicks ?? null,
    })),
    organicLeads,
    integrations,
  });
});
