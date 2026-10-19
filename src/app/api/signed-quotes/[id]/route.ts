import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { deleteObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

// DELETE /api/signed-quotes/[id] — מחיקת הצעת מחיר חתומה + הקובץ (מנהל בלבד).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireManager();
  const q = await prisma.signedQuote.findUnique({ where: { id: params.id } });
  if (!q) throw new ApiError(404, "לא נמצא");
  await deleteObject(q.fileKey).catch(() => {});
  await prisma.signedQuote.delete({ where: { id: q.id } });
  return NextResponse.json({ ok: true, deleted: true });
});
