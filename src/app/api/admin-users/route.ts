import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/admin-users — the agency's own accounts.
export const GET = handle(async () => {
  await requireAdmin();
  const users = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: {
      id: true, email: true, name: true, active: true, adminRole: true,
      lastLoginAt: true, googleId: true, phone: true, moduleAccess: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users });
});

const CreateAdmin = z.object({
  email: z.string().email("אימייל לא תקין"),
  name: z.string().min(1).max(120),
  password: z.string().min(6, "סיסמה קצרה מדי").optional().or(z.literal("")),
  phone: z.string().max(30).optional().nullable(),
  adminRole: z.enum(["manager", "staff"]).default("staff"),
});

// POST /api/admin-users — add an agency team member. Manager only.
export const POST = handle(async (req) => {
  const actor = await requireManager();
  const body = CreateAdmin.parse(await readJson(req));
  const email = body.email.toLowerCase().trim();

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new ApiError(409, "כבר קיים משתמש עם האימייל הזה");

  const user = await prisma.user.create({
    data: {
      email,
      name: body.name,
      passwordHash: body.password ? hashPassword(body.password) : null,
      role: "ADMIN",
      adminRole: body.adminRole,
      phone: body.phone || null,
    },
    select: { id: true, email: true, name: true, active: true, adminRole: true },
  });
  await audit(actor, "user_created", "user", user.id, `${user.email} (משרד: ${body.adminRole === "manager" ? "מנהל" : "עובד"})`);
  return NextResponse.json({ user }, { status: 201 });
});
