import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/campaigns?clientId
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));
  const campaigns = await prisma.campaign.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      _count: { select: { leads: true } },
    },
  });
  return NextResponse.json({ campaigns });
});

const CreateCampaign = z.object({
  clientId: z.string().optional(),
  name: z.string().min(1, "חסר שם קמפיין").max(160),
  kind: z.string().max(40).nullable().optional(),
  projectId: z.string().nullable().optional(),
});

// POST /api/campaigns
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = CreateCampaign.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  const exists = await prisma.campaign.findUnique({
    where: { clientId_name: { clientId, name: body.name } },
  });
  if (exists) throw new ApiError(409, "כבר קיים קמפיין בשם הזה");

  if (body.projectId) {
    const project = await prisma.project.findUnique({ where: { id: body.projectId } });
    if (!project || project.clientId !== clientId) {
      throw new ApiError(400, "פרויקט לא תקין");
    }
  }

  const campaign = await prisma.campaign.create({
    data: {
      clientId,
      name: body.name,
      kind: body.kind || null,
      projectId: body.projectId || null,
    },
  });
  return NextResponse.json({ campaign }, { status: 201 });
});
