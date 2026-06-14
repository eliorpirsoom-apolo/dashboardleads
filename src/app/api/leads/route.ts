import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseQuery } from "@/lib/query";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// GET /api/leads?preset=&campaign=&page=&pageSize=&q=
// Paginated, filterable leads for the data table.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { range, campaignId } = parseQuery(searchParams);

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(5, Number(searchParams.get("pageSize") ?? 25))
    );
    const q = (searchParams.get("q") ?? "").trim();

    const where: Prisma.LeadWhereInput = {
      receivedAt: { gte: new Date(range.from), lte: new Date(range.to) },
    };
    if (campaignId && campaignId !== "all") where.campaignId = campaignId;
    if (q) {
      where.OR = [
        { externalId: { contains: q } },
        { status: { contains: q } },
        { source: { contains: q } },
        { campaign: { name: { contains: q } } },
      ];
    }

    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { campaign: { select: { name: true } } },
      }),
    ]);

    return NextResponse.json({
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      leads: leads.map((l) => ({
        id: l.id,
        externalId: l.externalId,
        campaign: l.campaign.name,
        receivedAt: l.receivedAt.toISOString(),
        status: l.status,
        source: l.source,
      })),
    });
  } catch (err) {
    console.error("[api/leads]", err);
    return NextResponse.json({ error: "Failed to load leads" }, { status: 500 });
  }
}
