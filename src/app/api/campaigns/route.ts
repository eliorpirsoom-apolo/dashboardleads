import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/campaigns — list of campaigns for the dropdown selector, with the
// total number of leads each has (so the UI can show counts/sort).
export async function GET() {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        _count: { select: { leads: true } },
      },
    });

    return NextResponse.json({
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        leadCount: c._count.leads,
      })),
    });
  } catch (err) {
    console.error("[api/campaigns]", err);
    return NextResponse.json(
      { error: "Failed to load campaigns" },
      { status: 500 }
    );
  }
}
