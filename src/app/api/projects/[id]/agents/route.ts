import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";
import { hashPassword } from "@/lib/auth";
import { sendWelcome } from "@/lib/welcome";

export const dynamic = "force-dynamic";

// ניהול אנשי המכירות של פרויקט — "לכל פרויקט המשתמש והלידים שלו".
// הבעלים/המשרד מגדירים; הסוכן עובד.

async function scopedProject(id: string) {
  const user = await requireUser();
  assertNotAgent(user, "ניהול סוכני פרויקט");
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new ApiError(404, "פרויקט לא נמצא");
  scopeClientId(user, project.clientId);
  return { user, project };
}

const AddAgent = z.object({
  // שיוך משתמש קיים...
  userId: z.string().min(1).optional(),
  // ...או יצירת משווק חדש ושיוכו בפעולה אחת (מהכרטיס "משווקי הפרויקט").
  create: z
    .object({
      name: z.string().min(1, "חסר שם").max(120),
      email: z.string().email("אימייל לא תקין"),
      whatsappPhone: z.string().max(30).optional().nullable(),
      phone: z.string().max(30).optional().nullable(),
      password: z.string().min(6, "סיסמה קצרה מדי (מינימום 6)").optional().or(z.literal("")),
    })
    .optional(),
  isPrimary: z.boolean().default(false),
});

// POST /api/projects/[id]/agents — assign an agent (isPrimary switches the
// primary to this agent; only one primary per project). With `create` —
// creates a new marketer for the client and assigns them in one step.
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const { project } = await scopedProject(params.id);
  const body = AddAgent.parse(await readJson(req));
  if (!body.userId && !body.create) throw new ApiError(400, "חסר משתמש לשיוך");

  let userId = body.userId ?? "";
  let created = false;

  if (body.create) {
    const email = body.create.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // אם זה כבר משתמש של אותו לקוח — נשייך אותו במקום לשגות.
      if (existing.clientId !== project.clientId) {
        throw new ApiError(409, "כבר קיים משתמש עם האימייל הזה");
      }
      userId = existing.id;
    } else {
      const marketer = await prisma.user.create({
        data: {
          email,
          name: body.create.name,
          passwordHash: body.create.password ? hashPassword(body.create.password) : null,
          role: "CLIENT",
          isAgent: true,
          phone: body.create.phone || null,
          whatsappPhone: body.create.whatsappPhone || null,
          clientId: project.clientId,
        },
        select: { id: true },
      });
      userId = marketer.id;
      created = true;
      await sendWelcome({
        clientId: project.clientId,
        name: body.create.name,
        email,
        phone: body.create.phone || null,
      }).catch(() => null);
    }
  }

  // גם הבעלים יכול להיות איש המכירות של פרויקט: הוא יקבל את הלידים
  // הנכנסים, אבל הצמצום לפרויקטים חל רק על משתמשים מסומנים כסוכנים.
  const agent = await prisma.user.findUnique({ where: { id: userId } });
  if (!agent || agent.clientId !== project.clientId) {
    throw new ApiError(400, "המשתמש חייב להיות משתמש של הלקוח");
  }

  const [assignment] = await prisma.$transaction([
    prisma.projectAssignment.upsert({
      where: { projectId_userId: { projectId: project.id, userId } },
      create: { projectId: project.id, userId, isPrimary: body.isPrimary },
      update: { isPrimary: body.isPrimary },
    }),
    ...(body.isPrimary
      ? [
          prisma.projectAssignment.updateMany({
            where: { projectId: project.id, userId: { not: userId } },
            data: { isPrimary: false },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ assignment, created }, { status: 201 });
});

// DELETE /api/projects/[id]/agents?userId=x — unassign an agent.
export const DELETE = handle(async (req, { params }: { params: { id: string } }) => {
  const { project } = await scopedProject(params.id);
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) throw new ApiError(400, "חסר userId");

  await prisma.projectAssignment.deleteMany({
    where: { projectId: project.id, userId },
  });
  return NextResponse.json({ ok: true });
});
