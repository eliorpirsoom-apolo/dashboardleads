import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, ApiError } from "@/lib/api";
import { deleteObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

// DELETE /api/documents/[id] — admin or original uploader.
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc) throw new ApiError(404, "מסמך לא נמצא");
  scopeClientId(user, doc.clientId);
  if (user.role !== "ADMIN" && doc.uploadedById !== user.id) {
    throw new ApiError(403, "רק המשרד או מי שהעלה יכול למחוק");
  }

  await prisma.document.delete({ where: { id: params.id } });
  await deleteObject(doc.fileKey);
  return NextResponse.json({ ok: true });
});
