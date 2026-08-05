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
  // צירוף משתמש קיים (למשל משתמש-לקוח) כמשתמש משרד — נשלח רק לאחר אישור מפורש בממשק.
  promoteExisting: z.boolean().optional().default(false),
});

// POST /api/admin-users — add an agency team member. Manager only.
export const POST = handle(async (req) => {
  const actor = await requireManager();
  const body = CreateAdmin.parse(await readJson(req));
  const email = body.email.toLowerCase().trim();
  const roleLabel = body.adminRole === "manager" ? "מנהל" : "עובד";

  const exists = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, role: true, adminRole: true, active: true },
  });

  if (exists) {
    // כבר משתמש משרד — אין מה לצרף.
    if (exists.role === "ADMIN") {
      throw new ApiError(409, "כבר קיים משתמש משרד עם האימייל הזה");
    }
    // משתמש קיים (לקוח/סוכן). אם המנהל לא אישר צירוף — נחזיר הצעה לצרף אותו.
    if (!body.promoteExisting) {
      return NextResponse.json(
        {
          canPromote: true,
          existing: { id: exists.id, name: exists.name },
          message: `כבר קיים משתמש (${exists.name}) עם האימייל הזה. לצרף אותו כמשתמש משרד?`,
        },
        { status: 409 },
      );
    }
    // צירוף: הפיכת המשתמש הקיים למשתמש משרד (מנתקים אותו מהלקוח).
    const promoted = await prisma.user.update({
      where: { id: exists.id },
      data: {
        role: "ADMIN",
        adminRole: body.adminRole,
        clientId: null,
        isAgent: false,
        active: true,
        name: body.name || exists.name,
        phone: body.phone || undefined,
        // סיסמה חדשה רק אם סופקה; אחרת נשמרת ההתחברות הקיימת (Google/סיסמה).
        passwordHash: body.password ? hashPassword(body.password) : undefined,
      },
      select: { id: true, email: true, name: true, active: true, adminRole: true },
    });
    await audit(actor, "user_promoted_to_admin", "user", promoted.id, `${promoted.email} → משתמש משרד (${roleLabel})`);
    return NextResponse.json({ user: promoted, promoted: true }, { status: 200 });
  }

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
  await audit(actor, "user_created", "user", user.id, `${user.email} (משרד: ${roleLabel})`);
  return NextResponse.json({ user }, { status: 201 });
});
