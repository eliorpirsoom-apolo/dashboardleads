import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const CELL = z.enum(["", "planned", "done"]);

const UpdateRow = z.object({
  title: z.string().min(1).max(160).optional(),
  ownerName: z.string().max(120).nullable().optional(),
  color: z.string().max(20).optional(),
  // עדכון תא בודד: {week, status}. status ריק = ניקוי.
  setCell: z.object({ week: z.number().int().min(0).max(23), status: CELL }).optional(),
});

// PATCH /api/gantt/tasks/[id] — עריכת שורה או החלפת סטטוס תא. משרד בלבד.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const body = UpdateRow.parse(await readJson(req));
  const row = await prisma.ganttTask.findUnique({ where: { id: params.id } });
  if (!row) throw new ApiError(404, "שורה לא נמצאה");

  let weeks = row.weeks;
  if (body.setCell) {
    let obj: Record<string, string> = {};
    try {
      obj = JSON.parse(row.weeks) || {};
    } catch {
      obj = {};
    }
    if (body.setCell.status === "") delete obj[String(body.setCell.week)];
    else obj[String(body.setCell.week)] = body.setCell.status;
    weeks = JSON.stringify(obj);
  }

  const task = await prisma.ganttTask.update({
    where: { id: params.id },
    data: {
      title: body.title,
      ownerName: body.ownerName,
      color: body.color,
      ...(body.setCell ? { weeks } : {}),
    },
  });
  return NextResponse.json({
    task: { ...task, weeks: JSON.parse(task.weeks || "{}") },
  });
});

export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  await prisma.ganttTask.deleteMany({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
