import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const CreateRow = z.object({
  planId: z.string().min(1),
  title: z.string().min(1, "חסרה כותרת שורה").max(160),
  ownerName: z.string().max(120).nullable().optional(),
  color: z.string().max(20).optional(),
});

// POST /api/gantt/tasks — שורת גאנט חדשה. משרד בלבד.
export const POST = handle(async (req) => {
  await requireAdmin();
  const body = CreateRow.parse(await readJson(req));
  const plan = await prisma.ganttPlan.findUnique({ where: { id: body.planId } });
  if (!plan) throw new ApiError(404, "תוכנית לא נמצאה");
  const count = await prisma.ganttTask.count({ where: { planId: body.planId } });
  const task = await prisma.ganttTask.create({
    data: {
      planId: body.planId,
      title: body.title,
      ownerName: body.ownerName || null,
      color: body.color || "#22d3ee",
      order: count,
      weeks: "{}",
    },
  });
  return NextResponse.json({ task }, { status: 201 });
});
