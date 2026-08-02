import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, readJson, ApiError } from "@/lib/api";
import { notifyNewDesignMessage, notifyInternalDesignMessage } from "@/lib/studioLinks";
import { sanitizeRich, isRichEmpty } from "@/lib/sanitizeHtml";

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
// לקוח רואה רק ערוץ "client"; ההתכתבות הפנימית (internal) חשופה למשרד בלבד.
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  const { user } = await resolveTask(params.id);
  const messages = await prisma.designMessage.findMany({
    where: {
      designTaskId: params.id,
      ...(user.role === "ADMIN" ? {} : { channel: "client" }),
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ messages });
});

const NewMessage = z.object({
  body: z.string().min(1, "הודעה ריקה").max(3000),
  assetId: z.string().nullable().optional(), // הערה ממוקדת על תוצר ספציפי
  channel: z.enum(["client", "internal"]).default("client"), // "internal" = משרד בלבד
});

// POST /api/design-tasks/[id]/messages — הוספת הודעה לשרשור (משרד או לקוח).
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const { user, task } = await resolveTask(params.id);
  const b = NewMessage.parse(await readJson(req));
  // ערוץ עדכונים פנימי = HTML עשיר מסונן; שאר ההודעות = טקסט. סינון בכל מקרה (הגנת XSS).
  const body = sanitizeRich(b.body);
  if (isRichEmpty(body)) throw new ApiError(422, "הודעה ריקה");
  const plain = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "[מדיה]";
  // התכתבות פנימית — משרד בלבד. לקוח אינו יכול לכתוב/לקרוא ערוץ internal.
  if (b.channel === "internal" && user.role !== "ADMIN") {
    throw new ApiError(403, "התכתבות פנימית מותרת לצוות המשרד בלבד");
  }
  // הערה ממוקדת על תוצר קיימת רק בערוץ הלקוח.
  const assetId = b.channel === "client" ? b.assetId || null : null;
  if (assetId) {
    const asset = await prisma.designAsset.findFirst({
      where: { id: assetId, designTaskId: task.id },
      select: { id: true },
    });
    if (!asset) throw new ApiError(404, "תוצר לא נמצא");
  }
  const authorSide = user.role === "ADMIN" ? "agency" : "client";
  const message = await prisma.designMessage.create({
    data: {
      designTaskId: task.id,
      channel: b.channel,
      assetId,
      authorSide,
      authorId: user.id,
      authorName: user.name,
      body,
    },
  });
  // התראה (לא חוסם): לקוח↔משרד, או פנימי בין צוות המשרד. שולחים טקסט נקי (בלי HTML).
  if (b.channel === "internal") {
    notifyInternalDesignMessage(task.id, user.id, plain).catch((e) => console.error("[studio:msg-notify]", e));
  } else {
    notifyNewDesignMessage(task.id, authorSide, plain).catch((e) => console.error("[studio:msg-notify]", e));
  }
  return NextResponse.json({ message }, { status: 201 });
});
