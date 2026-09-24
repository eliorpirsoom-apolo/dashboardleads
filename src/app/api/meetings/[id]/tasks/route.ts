import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { normalizeBullets } from "@/lib/meetingSummary";
import { createTaskEvent } from "@/lib/gcal";

export const dynamic = "force-dynamic";

const Body = z.object({
  bulletId: z.string().min(1),
  assigneeId: z.string().nullable().optional(),
  dueAt: z.string().optional(),
});

// POST /api/meetings/[id]/tasks — "הורדה לביצוע": יצירת משימה במודול המשימות
// מתוך שורת סיכום, וקישורה חזרה לבולט. מנהל/עובד משרד.
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireAdmin();
  const b = Body.parse(await readJson(req));
  const m = await prisma.meetingSummary.findUnique({
    where: { id: params.id },
    include: { client: { select: { name: true } } },
  });
  if (!m) throw new ApiError(404, "סיכום לא נמצא");

  const bullets = normalizeBullets(JSON.parse(m.bullets || "[]"));
  const bullet = bullets.find((x) => x.id === b.bulletId);
  if (!bullet) throw new ApiError(404, "שורה לא נמצאה");
  if (bullet.taskId) {
    const exists = await prisma.task.findUnique({ where: { id: bullet.taskId } });
    if (exists) throw new ApiError(400, "כבר נוצרה משימה לשורה הזו");
  }

  const dueAt = b.dueAt ? new Date(b.dueAt) : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const due = isNaN(dueAt.getTime()) ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) : dueAt;
  const assigneeId = b.assigneeId || null;

  const task = await prisma.task.create({
    data: {
      clientId: m.clientId,
      title: bullet.text.slice(0, 200),
      description: `מתוך סיכום פגישה: ${m.title}`,
      type: "task",
      ownerSide: "agency",
      assigneeId,
      createdById: user.id,
      dueAt: due,
      status: "open",
      priority: "normal",
    },
  });

  // סנכרון ליומן Google של המשווק/היוצר (best-effort).
  await createTaskEvent({
    id: task.id,
    title: task.title,
    description: task.description,
    dueAt: due,
    type: "task",
    assigneeId,
    createdById: user.id,
  }).catch(() => {});

  // קישור הבולט למשימה + סימון כמשימה + שמירת אחראי/יעד.
  bullet.taskId = task.id;
  bullet.isTask = true;
  bullet.clientVisible = false;
  bullet.assigneeId = assigneeId;
  bullet.dueAt = due.toISOString();
  await prisma.meetingSummary.update({
    where: { id: m.id },
    data: { bullets: JSON.stringify(bullets) },
  });

  return NextResponse.json({ ok: true, taskId: task.id });
});
