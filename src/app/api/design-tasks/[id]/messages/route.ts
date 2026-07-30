import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// גישה: המשרד, או הלקוח של המשימה בלבד.
async function resolveTask(taskId: string) {
  const user = await requireUser();
  const task = await prisma.designTask.findUnique({
    where: { id: taskId },
    select: { id: true, clientId: true, title: true },
  });
  if (!task) throw new ApiError(404, "משימת עיצוב לא נמצאה");
  if (user.role !== "ADMIN" && user.clientId !== task.clientId) {
    throw new ApiError(403, "אין הרשאה");
  }
  return { user, task };
}

// GET /api/design-tasks/[id]/messages — שרשור ההתכתבות (מוקדם→מאוחר).
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  await resolveTask(params.id);
  const messages = await prisma.designMessage.findMany({
    where: { designTaskId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ messages });
});

const NewMessage = z.object({ body: z.string().min(1, "הודעה ריקה").max(3000) });

// POST /api/design-tasks/[id]/messages — הוספת הודעה לשרשור (משרד או לקוח).
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const { user, task } = await resolveTask(params.id);
  const b = NewMessage.parse(await readJson(req));
  const body = b.body.trim();
  if (!body) throw new ApiError(422, "הודעה ריקה");
  const message = await prisma.designMessage.create({
    data: {
      designTaskId: task.id,
      authorSide: user.role === "ADMIN" ? "agency" : "client",
      authorId: user.id,
      authorName: user.name,
      body,
    },
  });
  return NextResponse.json({ message }, { status: 201 });
});
