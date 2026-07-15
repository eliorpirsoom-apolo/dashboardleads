import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/budgets?clientId&periodKey — budgets with computed CPL.
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));

  const budgets = await prisma.budget.findMany({
    where: {
      clientId,
      ...(p.get("periodKey") ? { periodKey: p.get("periodKey")! } : {}),
    },
    orderBy: [{ periodKey: "desc" }, { createdAt: "asc" }],
    include: {
      campaign: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
  });

  // Leads per budget scope for CPL: campaign > project > whole client.
  const withCpl = await Promise.all(
    budgets.map(async (b) => {
      const [y, mOrW] = b.periodKey.split(/-W?/);
      let from: Date, to: Date;
      if (b.period === "weekly") {
        // ISO week -> range
        const simple = new Date(Number(y), 0, 1 + (Number(mOrW) - 1) * 7);
        const dow = simple.getDay();
        from = new Date(simple);
        from.setDate(simple.getDate() - ((dow + 6) % 7)); // Monday
        to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else {
        from = new Date(Number(y), Number(mOrW) - 1, 1);
        to = new Date(Number(y), Number(mOrW), 1);
      }
      const leads = await prisma.lead.count({
        where: {
          clientId,
          archived: false,
          receivedAt: { gte: from, lt: to },
          ...(b.campaignId ? { campaignId: b.campaignId } : {}),
          ...(b.projectId && !b.campaignId ? { projectId: b.projectId } : {}),
        },
      });
      return {
        ...b,
        leads,
        cpl: leads > 0 && b.spend > 0 ? b.spend / leads : null,
      };
    })
  );

  return NextResponse.json({ budgets: withCpl });
});

const UpsertBudget = z.object({
  clientId: z.string().optional(),
  campaignId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  period: z.enum(["monthly", "weekly"]),
  periodKey: z.string().regex(/^\d{4}-(\d{2}|W\d{1,2})$/, "מפתח תקופה לא תקין"),
  amount: z.number().min(0),
  spend: z.number().min(0).optional(),
  notes: z.string().max(500).nullable().optional(),
});

// POST /api/budgets — create or update (same scope+period = update).
export const POST = handle(async (req) => {
  const user = await requireUser();
  assertNotAgent(user);
  const body = UpsertBudget.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  const existing = await prisma.budget.findFirst({
    where: {
      clientId,
      campaignId: body.campaignId ?? null,
      projectId: body.projectId ?? null,
      period: body.period,
      periodKey: body.periodKey,
    },
  });

  const budget = existing
    ? await prisma.budget.update({
        where: { id: existing.id },
        data: { amount: body.amount, spend: body.spend, notes: body.notes },
      })
    : await prisma.budget.create({
        data: {
          clientId,
          campaignId: body.campaignId ?? null,
          projectId: body.projectId ?? null,
          period: body.period,
          periodKey: body.periodKey,
          amount: body.amount,
          spend: body.spend ?? 0,
          notes: body.notes ?? null,
        },
      });

  return NextResponse.json({ budget }, { status: existing ? 200 : 201 });
});
