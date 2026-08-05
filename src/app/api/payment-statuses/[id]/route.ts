import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";

export const dynamic = "force-dynamic";

async function guard() {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "payments")) throw new ApiError(403, "אין הרשאה למודול התשלומים");
}

const UpdateStatus = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().max(20).optional(),
  isPaid: z.boolean().optional(),
  order: z.number().int().optional(),
});

// PATCH /api/payment-statuses/[id] — עריכת סטטוס (שם/צבע/נחשב-כשולם/סדר).
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await guard();
  const b = UpdateStatus.parse(await readJson(req));
  const status = await prisma.paymentStatus.update({
    where: { id: params.id },
    data: {
      ...(b.name !== undefined ? { name: b.name.trim() } : {}),
      ...(b.color !== undefined ? { color: b.color } : {}),
      ...(b.isPaid !== undefined ? { isPaid: b.isPaid } : {}),
      ...(b.order !== undefined ? { order: b.order } : {}),
    },
  });
  return NextResponse.json({ status });
});

// DELETE /api/payment-statuses/[id] — מחיקת סטטוס (תאים שהשתמשו בו יאבדו את הסטטוס).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await guard();
  await prisma.paymentStatus.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
