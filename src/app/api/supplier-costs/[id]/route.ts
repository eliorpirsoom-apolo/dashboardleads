import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const UpdateRow = z.object({
  name: z.string().min(1).max(120).optional(),
  note: z.string().max(300).nullable().optional(),
  currency: z.enum(["USD", "ILS"]).optional(),
  fixedAmount: z.number().min(0).max(1000000).nullable().optional(),
  unitRate: z.number().min(0).max(1000).nullable().optional(),
});

// PATCH /api/supplier-costs/[id] — עדכון שורה (מנהלים בלבד).
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireManager();
  const b = UpdateRow.parse(await readJson(req));
  const row = await prisma.supplierCost.update({ where: { id: params.id }, data: b }).catch(() => {
    throw new ApiError(404, "שורה לא נמצאה");
  });
  return NextResponse.json({ row });
});

// DELETE /api/supplier-costs/[id] — הסרת שורה.
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireManager();
  await prisma.supplierCost.delete({ where: { id: params.id } }).catch(() => {
    throw new ApiError(404, "שורה לא נמצאה");
  });
  return NextResponse.json({ ok: true });
});
