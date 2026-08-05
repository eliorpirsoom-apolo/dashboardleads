import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";

export const dynamic = "force-dynamic";

async function guard() {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "payments")) throw new ApiError(403, "אין הרשאה למודול התשלומים");
}

// DELETE /api/payment-keywords/:id — מחיקת מילת סיווג.
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await guard();
  await prisma.paymentKeyword.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
