import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

const UpdateUser = z.object({
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(6, "סיסמה קצרה מדי").optional(),
  isAgent: z.boolean().optional(),
  adminRole: z.enum(["manager", "staff"]).optional(),
  phone: z.string().max(30).nullable().optional(),
  whatsappPhone: z.string().max(30).nullable().optional(), // וואטסאפ להתראות לידים (משווקים)
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  active: z.boolean().optional(),
  moduleAccess: z.array(z.string().max(40)).max(50).nullable().optional(), // הרשאות מודולים לעובד
});

// PATCH /api/users/[id] — agency manager: edit / reset password / deactivate.
// Password reset and deactivation also revoke all existing sessions.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const actor = await requireManager();
  const body = UpdateUser.parse(await readJson(req));

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) throw new ApiError(404, "משתמש לא נמצא");
  if (target.id === actor.id && body.active === false) {
    throw new ApiError(400, "אי אפשר להשבית את המשתמש של עצמך");
  }
  if (target.id === actor.id && body.adminRole === "staff") {
    throw new ApiError(400, "אי אפשר להוריד לעצמך את הרשאת המנהל");
  }

  const revokeSessions = Boolean(body.password) || body.active === false;

  const user = await prisma.user.update({
    where: { id: params.id },
    data: {
      name: body.name,
      isAgent: body.isAgent,
      ...(target.role === "ADMIN" && body.adminRole
        ? { adminRole: body.adminRole }
        : {}),
      phone: body.phone,
      ...(body.whatsappPhone !== undefined ? { whatsappPhone: body.whatsappPhone } : {}),
      ...(body.birthday !== undefined
        ? { birthday: body.birthday ? new Date(`${body.birthday}T12:00:00Z`) : null }
        : {}),
      active: body.active,
      ...(body.moduleAccess !== undefined
        ? { moduleAccess: body.moduleAccess ? JSON.stringify(body.moduleAccess) : null }
        : {}),
      ...(body.password ? { passwordHash: hashPassword(body.password) } : {}),
      ...(revokeSessions ? { tokenVersion: { increment: 1 } } : {}),
    },
    select: { id: true, email: true, name: true, isAgent: true, active: true, adminRole: true },
  });

  const action =
    body.active === false
      ? "user_deactivated"
      : body.password
        ? "user_password_reset"
        : body.adminRole
          ? "user_role_changed"
          : "user_updated";
  await audit(actor, action, "user", user.id, user.email);

  return NextResponse.json({ user });
});

// DELETE /api/users/[id] — מחיקה סופית. הגנות: לא את עצמך, ולא המנהל
// האחרון של המשרד. היסטוריה (לידים/הערות/משימות) נשמרת — הקישור מתנתק
// (השם נשמר מראש בשדה נפרד), אז לא הולך מידע.
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const actor = await requireManager();
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) throw new ApiError(404, "משתמש לא נמצא");
  if (target.id === actor.id) throw new ApiError(400, "אי אפשר למחוק את המשתמש של עצמך");

  if (target.role === "ADMIN" && target.adminRole === "manager") {
    const managers = await prisma.user.count({
      where: { role: "ADMIN", adminRole: "manager", active: true },
    });
    if (managers <= 1) throw new ApiError(400, "אי אפשר למחוק את מנהל המשרד האחרון");
  }

  await prisma.user.delete({ where: { id: target.id } });
  await audit(actor, "user_deleted", "user", target.id, target.email);
  return NextResponse.json({ ok: true });
});
