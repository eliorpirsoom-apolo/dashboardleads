import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const CreateUnit = z.object({
  name: z.string().min(1, "חסר שם טיפוס").max(120),
  rooms: z.number().nullable().optional(),
  price: z.number().min(0).default(0),
  totalUnits: z.number().int().min(0).default(0),
});

// POST /api/projects/[id]/units — add a unit type to the project.
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) throw new ApiError(404, "פרויקט לא נמצא");
  scopeClientId(user, project.clientId);

  const body = CreateUnit.parse(await readJson(req));
  const exists = await prisma.unitType.findUnique({
    where: { projectId_name: { projectId: project.id, name: body.name } },
  });
  if (exists) throw new ApiError(409, "כבר קיים טיפוס בשם הזה בפרויקט");

  const unit = await prisma.unitType.create({
    data: {
      projectId: project.id,
      name: body.name,
      rooms: body.rooms ?? null,
      price: body.price,
      totalUnits: body.totalUnits,
    },
  });
  return NextResponse.json({ unit }, { status: 201 });
});
