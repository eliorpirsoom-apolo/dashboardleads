import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, ApiError } from "@/lib/api";
import { presignDownload, readLocalObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET /api/files/[id] — THE download gate. Verifies session + client scope,
// then redirects to a short-lived R2 URL (or streams from disk in dev).
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc) throw new ApiError(404, "קובץ לא נמצא");
  scopeClientId(user, doc.clientId);

  // מסמך חיצוני (SUMIT) — הפניה לקישור ההורדה של הספק.
  if (doc.externalUrl) return NextResponse.redirect(doc.externalUrl);
  if (!doc.fileKey) throw new ApiError(404, "למסמך אין קובץ");

  const signed = await presignDownload(doc.fileKey, doc.fileName);
  if (signed) return NextResponse.redirect(signed);

  // Local driver: stream the bytes ourselves.
  try {
    const buf = await readLocalObject(doc.fileKey);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    throw new ApiError(404, "הקובץ לא נמצא באחסון");
  }
});
