import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const CreateTask = z.object({
  title: z.string().min(1, "חסרה משימה").max(200),
  assigneeId: z.string().nullable().optional(),
});

// POST /api/engagements/[id]/tasks — הוספת משימת אונבורדינג.
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const body = CreateTask.parse(await readJson(req));
  const engagement = await prisma.engagement.findUnique({ where: { id: params.id } });
  if (!engagement) throw new ApiError(404, "ליווי לא נמצא");

  const count = await prisma.engagementTask.count({ where: { engagementId: params.id } });
  const task = await prisma.engagementTask.create({
    data: {
      engagementId: params.id,
      title: body.title,
      assigneeId: body.assigneeId || null,
      order: count,
    },
    include: { assignee: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ task }, { status: 201 });
});

// DELETE /api/engagements/[id]/tasks — מחיקת כל משימות האונבורדינג של הליווי
// בבת אחת (הליווי עצמו נשאר). ?done=true מוחק רק את שבוצעו.
export const DELETE = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const engagement = await prisma.engagement.findUnique({ where: { id: params.id } });
  if (!engagement) throw new ApiError(404, "ליווי לא נמצא");
  const onlyDone = new URL(req.url).searchParams.get("done") === "true";
  const res = await prisma.engagementTask.deleteMany({
    where: { engagementId: params.id, ...(onlyDone ? { done: true } : {}) },
  });
  return NextResponse.json({ deleted: res.count });
});
