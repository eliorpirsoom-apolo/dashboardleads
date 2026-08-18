import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";

export const dynamic = "force-dynamic";

// DELETE /api/billing-alerts/[id] — מחיקת תזכורת הנה"ח.
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "payments")) throw new ApiError(403, "אין הרשאה למודול התשלומים");
  await prisma.billingReminder.delete({ where: { id: params.id } }).catch(() => {
    throw new ApiError(404, "התזכורת לא נמצאה");
  });
  return NextResponse.json({ ok: true });
});
