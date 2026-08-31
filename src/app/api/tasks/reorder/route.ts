import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, readJson, ApiError } from "@/lib/api";
import { syncTaskEvent } from "@/lib/gcal";

export const dynamic = "force-dynamic";

const Reorder = z.object({
  // הבורד שאליו נגררו המשימות: מזהה עובד או null ("ללא אחראי").
  assigneeId: z.string().nullable(),
  taskIds: z.array(z.string()).min(1).max(300),
});

// POST /api/tasks/reorder — סדר חדש לבורד של עובד; משימה שנגררה מבורד אחר
// מקבלת גם assigneeId חדש (והאירוע ביומן Google עובר ליומן של המטפל החדש).
// צד לקוח: רק משימות הצד שלו, ורק שיוך למשתמשים של הלקוח.
export const POST = handle(async (req) => {
  const user = await requireUser();
  const b = Reorder.parse(await readJson(req));

  if (user.role !== "ADMIN") {
    const foreign = await prisma.task.count({
      where: { id: { in: b.taskIds }, NOT: { clientId: user.clientId!, ownerSide: "client" } },
    });
    if (foreign > 0) throw new ApiError(403, "אין הרשאה למשימות אלו");
    if (b.assigneeId) {
      const target = await prisma.user.findUnique({ where: { id: b.assigneeId }, select: { clientId: true } });
      if (target?.clientId !== user.clientId) throw new ApiError(403, "שיוך רק למשתמשי הלקוח");
    }
  }

  const existing = await prisma.task.findMany({
    where: { id: { in: b.taskIds } },
    select: { id: true, assigneeId: true },
  });
  const prevAssignee = new Map(existing.map((t) => [t.id, t.assigneeId]));

  await prisma.$transaction(
    b.taskIds.map((id, i) =>
      prisma.task.update({
        where: { id },
        data: { orderIndex: i, assigneeId: b.assigneeId },
      })
    )
  );

  // סנכרון יומן רק למשימות שהמטפל שלהן השתנה בפועל (בד"כ אחת).
  for (const id of b.taskIds) {
    if (prevAssignee.has(id) && prevAssignee.get(id) !== b.assigneeId) {
      await syncTaskEvent(id).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
});
