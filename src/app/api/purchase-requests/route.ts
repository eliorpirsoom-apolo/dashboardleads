import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/purchase-requests?clientId&status&projectId
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));

  const requests = await prisma.purchaseRequest.findMany({
    where: {
      clientId,
      ...(p.get("status") ? { status: p.get("status")! } : {}),
      ...(p.get("projectId") ? { projectId: p.get("projectId")! } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      lead: { select: { id: true, fullName: true, number: true, phone: true } },
      project: { select: { id: true, name: true } },
      unitType: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ requests });
});

const CreateRequest = z.object({
  clientId: z.string().optional(),
  leadId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  unitTypeId: z.string().nullable().optional(),
  amount: z.number().min(0).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

// POST /api/purchase-requests — from a lead or standalone.
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = CreateRequest.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  if (body.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: body.leadId } });
    if (!lead || lead.clientId !== clientId) throw new ApiError(400, "ליד לא תקין");
  }

  const request = await prisma.purchaseRequest.create({
    data: {
      clientId,
      leadId: body.leadId || null,
      projectId: body.projectId || null,
      unitTypeId: body.unitTypeId || null,
      amount: body.amount ?? null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json({ request }, { status: 201 });
});
