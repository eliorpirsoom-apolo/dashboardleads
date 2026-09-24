import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { normalizeBullets } from "@/lib/meetingSummary";
import { createTaskEvent } from "@/lib/gcal";

export const dynamic = "force-dynamic";

const Body = z.object({
  bulletId: z.string().min(1).optional(),
  bulletIds: z.array(z.string().min(1)).optional(),
  all: z.boolean().optional(), // כל השורות המסומנות כמשימה שעדיין אין להן משימה
  assigneeId: z.string().nullable().optional(),
  dueAt: z.string().optional(),
});

// POST /api/meetings/[id]/tasks — "הורדה לביצוע": יצירת משימה/ות מתוך שורות
// הסיכום, וקישורן חזרה. תומך בשורה בודדת (bulletId) או בכמות (bulletIds/all).
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireAdmin();
  const b = Body.parse(await readJson(req));
  const m = await prisma.meetingSummary.findUnique({ where: { id: params.id } });
  if (!m) throw new ApiError(404, "סיכום לא נמצא");

  const bullets = normalizeBullets(JSON.parse(m.bullets || "[]"));
  const defaultDue = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

  // אילו שורות להוריד לביצוע.
  let targets = bullets.filter((x) => !x.taskId);
  if (b.all) targets = targets.filter((x) => x.isTask);
  else if (b.bulletIds?.length) targets = targets.filter((x) => b.bulletIds!.includes(x.id));
  else if (b.bulletId) targets = targets.filter((x) => x.id === b.bulletId);
  else throw new ApiError(400, "לא נבחרו שורות");
  if (targets.length === 0) throw new ApiError(400, "אין שורות חדשות ליצירת משימה");

  let created = 0;
  for (const bullet of targets) {
    const due = b.dueAt
      ? new Date(b.dueAt)
      : bullet.dueAt
        ? new Date(bullet.dueAt)
        : defaultDue();
    const dueDate = isNaN(due.getTime()) ? defaultDue() : due;
    const assigneeId = (b.assigneeId ?? bullet.assigneeId) || null;
    const task = await prisma.task.create({
      data: {
        clientId: m.clientId,
        title: bullet.text.slice(0, 200),
        description: `מתוך סיכום פגישה: ${m.title}`,
        type: "task",
        ownerSide: "agency",
        assigneeId,
        createdById: user.id,
        dueAt: dueDate,
        status: "open",
        priority: "normal",
      },
    });
    await createTaskEvent({
      id: task.id,
      title: task.title,
      description: task.description,
      dueAt: dueDate,
      type: "task",
      assigneeId,
      createdById: user.id,
    }).catch(() => {});
    bullet.taskId = task.id;
    bullet.isTask = true;
    bullet.clientVisible = false;
    bullet.assigneeId = assigneeId;
    bullet.dueAt = dueDate.toISOString();
    created++;
  }

  await prisma.meetingSummary.update({ where: { id: m.id }, data: { bullets: JSON.stringify(bullets) } });
  return NextResponse.json({ ok: true, created });
});
