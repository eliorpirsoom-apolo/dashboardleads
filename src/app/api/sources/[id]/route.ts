import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const UpdateSource = z.object({
  name: z.string().min(1).max(120).optional(),
  channel: z.string().max(40).nullable().optional(),
  platform: z.string().max(40).nullable().optional(),
  active: z.boolean().optional(),
  projectId: z.string().nullable().optional(),
});

export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const body = UpdateSource.parse(await readJson(req));
  if (body.projectId) {
    const existing = await prisma.leadSource.findUnique({ where: { id: params.id } });
    if (!existing) throw new ApiError(404, "מקור לא נמצא");
    const project = await prisma.project.findUnique({ where: { id: body.projectId } });
    if (!project || project.clientId !== existing.clientId) {
      throw new ApiError(400, "פרויקט לא תקין");
    }
  }
  const source = await prisma.leadSource.update({
    where: { id: params.id },
    data: body,
  });
  return NextResponse.json({ source });
});

export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const source = await prisma.leadSource.findUnique({
    where: { id: params.id },
    include: { _count: { select: { leads: true } } },
  });
  if (!source) throw new ApiError(404, "מקור לא נמצא");
  if (source._count.leads > 0) {
    // Keep history: deactivate instead of delete.
    await prisma.leadSource.update({
      where: { id: params.id },
      data: { active: false },
    });
    return NextResponse.json({ ok: true, deactivated: true });
  }
  await prisma.leadSource.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
