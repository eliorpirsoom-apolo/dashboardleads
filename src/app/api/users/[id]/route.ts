import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

const UpdateUser = z.object({
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(6, "סיסמה קצרה מדי").optional(),
  isAgent: z.boolean().optional(),
  phone: z.string().max(30).nullable().optional(),
  active: z.boolean().optional(),
});

// PATCH /api/users/[id] — admin: edit / reset password / deactivate.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const body = UpdateUser.parse(await readJson(req));

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) throw new ApiError(404, "משתמש לא נמצא");
  if (target.id === admin.id && body.active === false) {
    throw new ApiError(400, "אי אפשר להשבית את המשתמש של עצמך");
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: {
      name: body.name,
      isAgent: body.isAgent,
      phone: body.phone,
      active: body.active,
      ...(body.password ? { passwordHash: hashPassword(body.password) } : {}),
    },
    select: { id: true, email: true, name: true, isAgent: true, active: true },
  });

  return NextResponse.json({ user });
});
