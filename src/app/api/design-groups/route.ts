import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/design-groups — קבוצות הסטודיו לפי סדר.
export const GET = handle(async () => {
  await requireAdmin();
  const groups = await prisma.designGroup.findMany({ orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ groups });
});

const CreateGroup = z.object({
  name: z.string().min(1, "חסר שם").max(80),
  color: z.string().max(20).nullable().optional(),
});

// POST /api/design-groups — קבוצה חדשה (נוספת בסוף).
export const POST = handle(async (req) => {
  await requireAdmin();
  const b = CreateGroup.parse(await readJson(req));
  const last = await prisma.designGroup.findFirst({ orderBy: { orderIndex: "desc" }, select: { orderIndex: true } });
  const group = await prisma.designGroup.create({
    data: { name: b.name, color: b.color || null, orderIndex: (last?.orderIndex ?? -1) + 1 },
  });
  return NextResponse.json({ group }, { status: 201 });
});
