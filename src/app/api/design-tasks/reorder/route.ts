import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const Body = z.object({
  groupId: z.string().nullable(), // null = ללא קבוצה
  taskIds: z.array(z.string()).max(1000), // הסדר המלא והמדויק של הקבוצה
});

// POST /api/design-tasks/reorder — שמירת הסדר המדויק של קבוצה (גרירה).
// הלקוח שולח את רשימת ה-IDs לפי הסדר הרצוי; השרת קובע groupId + orderIndex לפי המיקום.
export const POST = handle(async (req) => {
  await requireAdmin();
  const b = Body.parse(await readJson(req));
  if (b.groupId) {
    const g = await prisma.designGroup.findUnique({ where: { id: b.groupId }, select: { id: true } });
    if (!g) throw new ApiError(404, "קבוצה לא נמצאה");
  }
  // רק משימות קיימות (עמידות לקלט לא-תקין).
  const existing = await prisma.designTask.findMany({
    where: { id: { in: b.taskIds } },
    select: { id: true },
  });
  const valid = new Set(existing.map((t) => t.id));
  const ordered = b.taskIds.filter((id) => valid.has(id));
  await prisma.$transaction(
    ordered.map((id, i) =>
      prisma.designTask.update({ where: { id }, data: { groupId: b.groupId, orderIndex: i } })
    )
  );
  return NextResponse.json({ ok: true, count: ordered.length });
});
