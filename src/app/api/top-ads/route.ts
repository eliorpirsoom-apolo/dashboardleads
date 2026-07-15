import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson } from "@/lib/api";
import { ilMonthKey } from "@/lib/time";

export const dynamic = "force-dynamic";

// "2 המודעות החזקות של החודש" — manual marking (auto via Meta in Phase 3).

// GET /api/top-ads?clientId&month
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));
  const month = p.get("month") ?? ilMonthKey();

  const ads = await prisma.topAd.findMany({
    where: { clientId, month },
    orderBy: { rank: "asc" },
  });
  return NextResponse.json({ ads, month });
});

const UpsertTopAd = z.object({
  clientId: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  rank: z.number().int().min(1).max(2),
  name: z.string().min(1, "חסר שם מודעה").max(200),
  platform: z.string().max(40).nullable().optional(),
  metric: z.string().max(200).nullable().optional(),
  imageKey: z.string().max(400).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

// POST /api/top-ads — set/replace the #1 or #2 ad of a month.
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = UpsertTopAd.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  const ad = await prisma.topAd.upsert({
    where: {
      clientId_month_rank: { clientId, month: body.month, rank: body.rank },
    },
    create: {
      clientId,
      month: body.month,
      rank: body.rank,
      name: body.name,
      platform: body.platform ?? null,
      metric: body.metric ?? null,
      imageKey: body.imageKey ?? null,
      notes: body.notes ?? null,
    },
    update: {
      name: body.name,
      platform: body.platform ?? null,
      metric: body.metric ?? null,
      imageKey: body.imageKey ?? null,
      notes: body.notes ?? null,
    },
  });
  return NextResponse.json({ ad });
});
