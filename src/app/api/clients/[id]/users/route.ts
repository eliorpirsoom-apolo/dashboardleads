import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { sendWelcome } from "@/lib/welcome";

export const dynamic = "force-dynamic";

const CreateUser = z.object({
  email: z.string().email("אימייל לא תקין"),
  name: z.string().min(1, "חסר שם").max(120),
  password: z.string().min(6, "סיסמה קצרה מדי (מינימום 6)").optional().or(z.literal("")),
  isAgent: z.boolean().default(false),
  phone: z.string().max(30).optional().nullable(),
});

// POST /api/clients/[id]/users — provision a client user (or sales agent).
// Without a password the account is Google-login-only.
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const actor = await requireManager();
  const body = CreateUser.parse(await readJson(req));

  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");

  const email = body.email.toLowerCase().trim();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new ApiError(409, "כבר קיים משתמש עם האימייל הזה");

  const user = await prisma.user.create({
    data: {
      email,
      name: body.name,
      passwordHash: body.password ? hashPassword(body.password) : null,
      role: "CLIENT",
      isAgent: body.isAgent,
      phone: body.phone || null,
      clientId: params.id,
    },
    select: { id: true, email: true, name: true, isAgent: true, active: true },
  });

  await audit(actor, "user_created", "user", user.id, `${user.email} (לקוח: ${client.name})`);

  // מייל "ברוכים הבאים" — כדי שהלקוח יידע שנפתח לו דשבורד.
  const welcome = await sendWelcome({
    clientId: params.id,
    name: user.name,
    email: user.email,
    phone: body.phone || null,
  }).catch(() => null);

  return NextResponse.json({ user, welcome }, { status: 201 });
});
