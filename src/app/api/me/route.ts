import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, readJson, ApiError } from "@/lib/api";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const UpdateMe = z.object({
  name: z.string().min(1, "חסר שם").max(120).optional(),
  phone: z.string().max(30).nullable().optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  // Password change requires proving the current password.
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "סיסמה חדשה קצרה מדי (מינימום 8)").optional(),
});

// PATCH /api/me — self-service profile: name, phone, password.
// Changing the password revokes all other sessions (tokenVersion bump)
// and re-issues a fresh cookie so THIS session stays logged in.
export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = UpdateMe.parse(await readJson(req));

  let bumpVersion = false;
  let newHash: string | undefined;

  if (body.newPassword) {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) throw new ApiError(404, "משתמש לא נמצא");
    if (dbUser.passwordHash) {
      if (
        !body.currentPassword ||
        !verifyPassword(body.currentPassword, dbUser.passwordHash)
      ) {
        throw new ApiError(400, "הסיסמה הנוכחית שגויה");
      }
    }
    newHash = hashPassword(body.newPassword);
    bumpVersion = true;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: body.name,
      phone: body.phone,
      ...(body.birthday !== undefined
        ? { birthday: body.birthday ? new Date(`${body.birthday}T12:00:00Z`) : null }
        : {}),
      ...(newHash ? { passwordHash: newHash } : {}),
      ...(bumpVersion ? { tokenVersion: { increment: 1 } } : {}),
    },
  });

  const res = NextResponse.json({
    ok: true,
    user: { id: updated.id, name: updated.name, phone: updated.phone },
  });
  if (bumpVersion) {
    res.cookies.set(
      SESSION_COOKIE,
      createSessionToken(updated.id, updated.tokenVersion),
      sessionCookieOptions
    );
  }
  return res;
});
