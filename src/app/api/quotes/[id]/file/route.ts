import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { presignDownload, readLocalObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET /api/quotes/[id]/file — הורדת קובץ ההצעה (צד משרד בלבד).
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const quote = await prisma.quote.findUnique({ where: { id: params.id } });
  if (!quote?.fileKey) throw new ApiError(404, "אין קובץ להצעה זו");

  const signed = await presignDownload(quote.fileKey, quote.fileName ?? "quote.pdf");
  if (signed) return NextResponse.redirect(signed);

  try {
    const buf = await readLocalObject(quote.fileKey);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": quote.mimeType ?? "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(quote.fileName ?? "quote.pdf")}`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    throw new ApiError(404, "הקובץ לא נמצא באחסון");
  }
});
