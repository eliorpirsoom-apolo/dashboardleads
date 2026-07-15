import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/contracts?clientId&projectId
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));

  const contracts = await prisma.contract.findMany({
    where: {
      clientId,
      ...(p.get("projectId") ? { projectId: p.get("projectId")! } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      lead: { select: { id: true, fullName: true, number: true } },
      project: { select: { id: true, name: true } },
      unitType: { select: { id: true, name: true } },
      document: { select: { id: true, fileName: true } },
    },
  });
  return NextResponse.json({
    contracts,
    totalValue: contracts.reduce((s, c) => s + c.value, 0),
  });
});

const CreateContract = z.object({
  clientId: z.string().optional(),
  leadId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  unitTypeId: z.string().nullable().optional(),
  value: z.number().min(0),
  signedAt: z.string().nullable().optional(),
  documentId: z.string().nullable().optional(), // the signed PDF
  notes: z.string().max(1000).nullable().optional(),
});

// POST /api/contracts — register a signed contract (PDF uploaded separately).
export const POST = handle(async (req) => {
  const user = await requireUser();
  assertNotAgent(user);
  const body = CreateContract.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  if (body.documentId) {
    const doc = await prisma.document.findUnique({ where: { id: body.documentId } });
    if (!doc || doc.clientId !== clientId) throw new ApiError(400, "מסמך לא תקין");
  }
  if (body.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: body.leadId } });
    if (!lead || lead.clientId !== clientId) throw new ApiError(400, "ליד לא תקין");
  }

  const contract = await prisma.contract.create({
    data: {
      clientId,
      leadId: body.leadId || null,
      projectId: body.projectId || null,
      unitTypeId: body.unitTypeId || null,
      value: body.value,
      signedAt: body.signedAt ? new Date(body.signedAt) : null,
      documentId: body.documentId || null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json({ contract }, { status: 201 });
});
