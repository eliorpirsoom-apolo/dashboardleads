import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

// DELETE /api/gcal — ניתוק יומן Google של המשתמש המחובר.
// (ההרשאה עצמה ניתנת לביטול גם ב-myaccount.google.com/permissions)
export const DELETE = handle(async () => {
  const user = await requireAdmin();
  await prisma.calendarConnection.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
});
