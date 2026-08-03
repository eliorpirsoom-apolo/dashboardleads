import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const UpdateItem = z.object({
  text: z.string().min(1, "טקסט ריק").max(2000).optional(),
  status: z.enum(["inbox", "done", "converted"]).optional(),
  convertedTaskId: z.string().max(60).nullable().optional(),
});

// PATCH /api/task-inbox/[id] — עריכת טקסט / סימון בוצע / סימון הומר-למשימה.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const cur = await prisma.taskInbox.findUnique({ where: { id: params.id } });
  if (!cur) throw new ApiError(404, "פריט לא נמצא");
  const b = UpdateItem.parse(await readJson(req));
  const data: Record<string, unknown> = {};
  if (b.text !== undefined) data.text = b.text.trim();
  if (b.status !== undefined) data.status = b.status;
  if (b.convertedTaskId !== undefined) data.convertedTaskId = b.convertedTaskId || null;
  const item = await prisma.taskInbox.update({ where: { id: params.id }, data });
  return NextResponse.json({ item });
});

// DELETE /api/task-inbox/[id] — מחיקת פריט מהמאגר.
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const cur = await prisma.taskInbox.findUnique({ where: { id: params.id } });
  if (!cur) throw new ApiError(404, "פריט לא נמצא");
  await prisma.taskInbox.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
