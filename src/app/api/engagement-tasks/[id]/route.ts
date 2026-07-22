import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const UpdateTask = z.object({
  title: z.string().min(1).max(200).optional(),
  assigneeId: z.string().nullable().optional(),
  done: z.boolean().optional(),
});

// PATCH /api/engagement-tasks/[id] — סימון בוצע / שיוך מבצע / עריכה.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const body = UpdateTask.parse(await readJson(req));
  const existing = await prisma.engagementTask.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "משימה לא נמצאה");
  const task = await prisma.engagementTask.update({
    where: { id: params.id },
    data: body,
    include: { assignee: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ task });
});

export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  await prisma.engagementTask.deleteMany({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
