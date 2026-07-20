import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";
import { allowedProjectIds } from "@/lib/projectScope";

export const dynamic = "force-dynamic";

async function scopedProject(id: string) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new ApiError(404, "פרויקט לא נמצא");
  scopeClientId(user, project.clientId);
  // סוכן-פרויקטים ניגש רק לפרויקטים שהוא משויך אליהם.
  const allowed = await allowedProjectIds(user);
  if (allowed && !allowed.includes(project.id)) {
    throw new ApiError(403, "הפרויקט לא משויך אליך");
  }
  return { user, project };
}

// GET /api/projects/[id] — full project workspace data.
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  const { project } = await scopedProject(params.id);

  const full = await prisma.project.findUnique({
    where: { id: project.id },
    include: {
      unitTypes: {
        orderBy: { createdAt: "asc" },
        include: {
          priceChanges: { orderBy: { createdAt: "desc" }, take: 30 },
          documents: { where: { category: "floor_plan" } },
          _count: { select: { leads: true } },
        },
      },
      contracts: {
        orderBy: { createdAt: "desc" },
        include: {
          lead: { select: { id: true, fullName: true, number: true } },
          unitType: { select: { name: true } },
          document: { select: { id: true, fileName: true } },
        },
      },
      purchaseRequests: {
        orderBy: { createdAt: "desc" },
        include: {
          lead: { select: { id: true, fullName: true, number: true, phone: true } },
          unitType: { select: { id: true, name: true } },
        },
      },
      assignments: {
        include: { user: { select: { id: true, name: true, email: true, active: true } } },
      },
    },
  });

  // Recent inventory audit trail for the project's unit types.
  const events = await prisma.inventoryEvent.findMany({
    where: { unitType: { projectId: project.id } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      unitType: { select: { name: true } },
      lead: { select: { fullName: true, number: true } },
    },
  });

  return NextResponse.json({ project: full, inventoryEvents: events });
});

const UpdateProject = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: z.enum(["active", "done", "archived"]).optional(),
  logoKey: z.string().max(400).nullable().optional(),
});

export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const { user, project } = await scopedProject(params.id);
  assertNotAgent(user);
  const body = UpdateProject.parse(await readJson(req));
  const updated = await prisma.project.update({
    where: { id: project.id },
    data: body,
  });
  return NextResponse.json({ project: updated });
});
