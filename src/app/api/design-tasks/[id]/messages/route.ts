import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, readJson, ApiError } from "@/lib/api";
import { notifyNewDesignMessage } from "@/lib/studioLinks";

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

const NewMessage = z.object({
  body: z.string().min(1, "הודעה ריקה").max(3000),
  assetId: z.string().nullable().optional(), // הערה ממוקדת על תוצר ספציפי
});

// POST /api/design-tasks/[id]/messages — הוספת הודעה לשרשור (משרד או לקוח).
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const { user, task } = await resolveTask(params.id);
  const b = NewMessage.parse(await readJson(req));
  const body = b.body.trim();
  if (!body) throw new ApiError(422, "הודעה ריקה");
  // אם ההודעה מקושרת לתוצר — לוודא שהוא שייך למשימה.
  if (b.assetId) {
    const asset = await prisma.designAsset.findFirst({
      where: { id: b.assetId, designTaskId: task.id },
      select: { id: true },
    });
    if (!asset) throw new ApiError(404, "תוצר לא נמצא");
  }
  const authorSide = user.role === "ADMIN" ? "agency" : "client";
  const message = await prisma.designMessage.create({
    data: {
      designTaskId: task.id,
      assetId: b.assetId || null,
      authorSide,
      authorId: user.id,
      authorName: user.name,
      body,
    },
  });
  // התראה לצד השני (לא חוסם את התגובה).
  notifyNewDesignMessage(task.id, authorSide, body).catch((e) => console.error("[studio:msg-notify]", e));
  return NextResponse.json({ message }, { status: 201 });
});
