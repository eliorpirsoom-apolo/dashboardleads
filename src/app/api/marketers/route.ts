import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { sendWelcome } from "@/lib/welcome";
import { requireClientOwner, reconcileProjects } from "@/lib/marketers";

export const dynamic = "force-dynamic";

// GET /api/marketers — משווקי הלקוח (עם הפרויקטים שלהם) + הפרויקטים הזמינים לשיוך.
export const GET = handle(async () => {
  const owner = await requireClientOwner();
  const [marketers, projects] = await Promise.all([
    prisma.user.findMany({
      where: { clientId: owner.clientId, role: "CLIENT", isAgent: true },
      select: {
        id: true, name: true, email: true, phone: true, active: true, lastLoginAt: true,
        projectAssignments: { select: { projectId: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.project.findMany({
      where: { clientId: owner.clientId },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return NextResponse.json({
    marketers: marketers.map((m) => ({
      id: m.id, name: m.name, email: m.email, phone: m.phone,
      active: m.active, lastLoginAt: m.lastLoginAt,
      projectIds: m.projectAssignments.map((a) => a.projectId),
    })),
    projects,
  });
});

const CreateMarketer = z.object({
  name: z.string().min(1, "חסר שם").max(120),
  email: z.string().email("אימייל לא תקין"),
  phone: z.string().max(30).optional().nullable(),
  password: z.string().min(6, "סיסמה קצרה מדי (מינימום 6)").optional().or(z.literal("")),
  projectIds: z.array(z.string()).max(200).optional().default([]),
});

// POST /api/marketers — פתיחת משווק (או צירוף לפי מייל אם כבר קיים ללקוח) + שיוך פרויקטים.
export const POST = handle(async (req) => {
  const owner = await requireClientOwner();
  const body = CreateMarketer.parse(await readJson(req));
  const email = body.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  let marketerId: string;
  let created = false;

  if (existing) {
    // צירוף לפי מייל: מותר רק אם זה כבר משווק של אותו לקוח.
    if (existing.clientId === owner.clientId && existing.role === "CLIENT" && existing.isAgent) {
      marketerId = existing.id;
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          phone: body.phone ?? existing.phone,
          active: true,
          ...(body.password ? { passwordHash: hashPassword(body.password) } : {}),
        },
      });
    } else if (existing.clientId === owner.clientId && !existing.isAgent) {
      throw new ApiError(409, "המייל הזה שייך לבעל הכרטיס, לא ניתן להגדירו כמשווק");
    } else {
      throw new ApiError(409, "כבר קיים משתמש עם האימייל הזה");
    }
  } else {
    const marketer = await prisma.user.create({
      data: {
        email,
        name: body.name,
        passwordHash: body.password ? hashPassword(body.password) : null,
        role: "CLIENT",
        isAgent: true,
        phone: body.phone || null,
        clientId: owner.clientId,
      },
      select: { id: true },
    });
    marketerId = marketer.id;
    created = true;
  }

  await reconcileProjects(marketerId, owner.clientId, body.projectIds);

  // מייל "ברוכים הבאים" למשווק חדש (מיטבי — לא חוסם).
  if (created) {
    await sendWelcome({ clientId: owner.clientId, name: body.name, email, phone: body.phone || null }).catch(() => null);
  }

  return NextResponse.json({ ok: true, id: marketerId, created }, { status: created ? 201 : 200 });
});
