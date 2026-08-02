import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { sanitizeRich, isRichEmpty } from "@/lib/sanitizeHtml";

export const dynamic = "force-dynamic";

// אימות שהעדכון קיים, שייך למשימה, והוא בלוק פנימי (עריכה/מחיקה מוגבלות ליומן העדכונים).
async function resolveInternalMessage(taskId: string, messageId: string) {
  await requireAdmin();
  const msg = await prisma.designMessage.findFirst({
    where: { id: messageId, designTaskId: taskId },
  });
  if (!msg) throw new ApiError(404, "עדכון לא נמצא");
  if (msg.channel !== "internal") throw new ApiError(403, "ניתן לערוך/למחוק עדכונים פנימיים בלבד");
  return msg;
}

const EditMessage = z.object({ body: z.string().min(1, "עדכון ריק").max(20000) });

// PATCH /api/design-tasks/[id]/messages/[messageId] — עריכת עדכון פנימי (מנהל בלבד).
export const PATCH = handle(async (req, { params }: { params: { id: string; messageId: string } }) => {
  await resolveInternalMessage(params.id, params.messageId);
  const b = EditMessage.parse(await readJson(req));
  const body = sanitizeRich(b.body);
  if (isRichEmpty(body)) throw new ApiError(422, "עדכון ריק");
  const message = await prisma.designMessage.update({
    where: { id: params.messageId },
    data: { body, editedAt: new Date() },
  });
  return NextResponse.json({ message });
});

// DELETE /api/design-tasks/[id]/messages/[messageId] — מחיקת עדכון פנימי (מנהל בלבד).
export const DELETE = handle(async (_req, { params }: { params: { id: string; messageId: string } }) => {
  await resolveInternalMessage(params.id, params.messageId);
  await prisma.designMessage.delete({ where: { id: params.messageId } });
  return NextResponse.json({ ok: true });
});
