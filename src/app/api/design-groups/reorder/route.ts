import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

const Body = z.object({ groupIds: z.array(z.string()).max(500) });

// POST /api/design-groups/reorder — שמירת סדר הקבוצות (גרירת בלוקים).
export const POST = handle(async (req) => {
  await requireAdmin();
  const b = Body.parse(await readJson(req));
  const existing = await prisma.designGroup.findMany({
    where: { id: { in: b.groupIds } },
    select: { id: true },
  });
  const valid = new Set(existing.map((g) => g.id));
  const ordered = b.groupIds.filter((id) => valid.has(id));
  await prisma.$transaction(
    ordered.map((id, i) => prisma.designGroup.update({ where: { id }, data: { orderIndex: i } }))
  );
  return NextResponse.json({ ok: true, count: ordered.length });
});
