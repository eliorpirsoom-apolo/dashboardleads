import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { sendWelcome } from "@/lib/welcome";

export const dynamic = "force-dynamic";

// POST /api/users/[id]/welcome — שליחה/שליחה חוזרת של מייל "ברוכים הבאים"
// למשתמש לקוח. שימושי כשלקוח נפתח אבל לא קיבל את ההזמנה.
export const POST = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireManager();
  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) throw new ApiError(404, "משתמש לא נמצא");
  if (!user.email) throw new ApiError(400, "למשתמש אין כתובת מייל");

  const res = await sendWelcome({
    clientId: user.clientId,
    name: user.name,
    email: user.email,
    phone: user.phone,
  });
  return NextResponse.json({ ok: true, sent: res });
});
