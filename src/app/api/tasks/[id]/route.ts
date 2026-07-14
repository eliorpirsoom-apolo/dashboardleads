import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

async function scopedTask(id: string) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new ApiError(404, "משימה לא נמצאה");
  if (user.role !== "ADMIN") {
    if (task.clientId !== user.clientId || task.ownerSide !== "client") {
      throw new ApiError(403, "אין הרשאה למשימה זו");
    }
  }
  return { user, task };
}

const UpdateTask = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  dueAt: z.string().optional(),
  durationMin: z.number().int().min(5).max(720).nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  status: z.enum(["open", "done", "canceled"]).optional(),
  reminder: z
    .object({
      channel: z.enum(["email", "sms", "whatsapp"]),
      minutesBefore: z.number().int().min(0).max(60 * 24 * 14),
    })
    .nullable()
    .optional(),
});

export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const { task } = await scopedTask(params.id);
  const body = UpdateTask.parse(await readJson(req));

  const dueAt = body.dueAt ? new Date(body.dueAt) : undefined;
  if (dueAt && isNaN(dueAt.getTime())) throw new ApiError(400, "מועד לא תקין");

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.task.update({
      where: { id: task.id },
      data: {
        title: body.title,
        description: body.description,
        dueAt,
        durationMin: body.durationMin,
        location: body.location,
        assigneeId: body.assigneeId,
        status: body.status,
        completedAt: body.status === "done" ? new Date() : body.status === "open" ? null : undefined,
      },
    });

    // Replace pending reminder if requested (or when due date moved).
    if (body.reminder !== undefined) {
      await tx.reminder.deleteMany({
        where: { taskId: task.id, status: "pending" },
      });
      if (body.reminder) {
        await tx.reminder.create({
          data: {
            taskId: task.id,
            channel: body.reminder.channel,
            remindAt: new Date(
              (dueAt ?? task.dueAt).getTime() -
                body.reminder.minutesBefore * 60_000
            ),
          },
        });
      }
    } else if (dueAt) {
      // Shift pending reminders by the same delta the due date moved.
      const delta = dueAt.getTime() - task.dueAt.getTime();
      const pending = await tx.reminder.findMany({
        where: { taskId: task.id, status: "pending" },
      });
      for (const r of pending) {
        await tx.reminder.update({
          where: { id: r.id },
          data: { remindAt: new Date(r.remindAt.getTime() + delta) },
        });
      }
    }
    return t;
  });

  return NextResponse.json({ task: updated });
});

export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const { task } = await scopedTask(params.id);
  await prisma.task.delete({ where: { id: task.id } });
  return NextResponse.json({ ok: true });
});
