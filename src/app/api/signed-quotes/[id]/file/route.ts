import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { presignDownload, getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET /api/signed-quotes/[id]/file — הגשת הקובץ (מנהל בלבד). ?download=1 להורדה.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireManager();
    const q = await prisma.signedQuote.findUnique({ where: { id: params.id } });
    if (!q) throw new ApiError(404, "לא נמצא");
    const download = new URL(req.url).searchParams.get("download") === "1";
    const signed = await presignDownload(
      q.fileKey,
      q.fileName,
      600,
      download ? "attachment" : "inline"
    );
    if (signed) return NextResponse.redirect(signed);
    const buf = await getObject(q.fileKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": q.mimeType || "application/octet-stream",
        "Cache-Control": "private, max-age=300",
        ...(download ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(q.fileName)}` } : {}),
      },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "שגיאה" }, { status });
  }
}
