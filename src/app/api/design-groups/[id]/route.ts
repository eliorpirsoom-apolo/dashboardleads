import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const UpdateGroup = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z.string().max(20).nullable().optional(),
  orderIndex: z.number().int().min(0).max(9999).optional(),
});

// PATCH /api/design-groups/[id] — שינוי שם/צבע/סדר קבוצה.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const cur = await prisma.designGroup.findUnique({ where: { id: params.id } });
  if (!cur) throw new ApiError(404, "קבוצה לא נמצאה");
  const b = UpdateGroup.parse(await readJson(req));
  const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = b.name;
  if (b.color !== undefined) data.color = b.color || null;
  if (b.orderIndex !== undefined) data.orderIndex = b.orderIndex;
  const group = await prisma.designGroup.update({ where: { id: params.id }, data });
  return NextResponse.json({ group });
});

// DELETE /api/design-groups/[id] — מחיקת קבוצה (המשימות עוברות ל"ללא קבוצה", לא נמחקות).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const cur = await prisma.designGroup.findUnique({ where: { id: params.id } });
  if (!cur) throw new ApiError(404, "קבוצה לא נמצאה");
  await prisma.designGroup.delete({ where: { id: params.id } }); // groupId → null דרך ה-FK
  return NextResponse.json({ ok: true });
});
