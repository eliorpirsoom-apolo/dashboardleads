import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";

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
  userId: z.string().min(1),
  isPrimary: z.boolean().default(false),
});

// POST /api/projects/[id]/agents — assign an agent (isPrimary switches the
// primary to this agent; only one primary per project).
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const { project } = await scopedProject(params.id);
  const body = AddAgent.parse(await readJson(req));

  const agent = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!agent || agent.clientId !== project.clientId || !agent.isAgent) {
    throw new ApiError(400, "המשתמש חייב להיות סוכן מכירות של הלקוח");
  }

  const [assignment] = await prisma.$transaction([
    prisma.projectAssignment.upsert({
      where: { projectId_userId: { projectId: project.id, userId: body.userId } },
      create: { projectId: project.id, userId: body.userId, isPrimary: body.isPrimary },
      update: { isPrimary: body.isPrimary },
    }),
    ...(body.isPrimary
      ? [
          prisma.projectAssignment.updateMany({
            where: { projectId: project.id, userId: { not: body.userId } },
            data: { isPrimary: false },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ assignment }, { status: 201 });
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
