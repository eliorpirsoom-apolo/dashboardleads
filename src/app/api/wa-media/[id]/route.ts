import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, ApiError } from "@/lib/api";
import { presignDownload, readLocalObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET /api/wa-media/[id] — הגשת מדיה יוצאת שנשלחה בוואטסאפ (משרד בלבד).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    if (user.role !== "ADMIN") throw new ApiError(403, "צד משרד בלבד");
    const msg = await prisma.whatsappMessage.findUnique({ where: { id: params.id } });
    if (!msg?.mediaKey) throw new ApiError(404, "קובץ לא נמצא");
    const signed = await presignDownload(msg.mediaKey, msg.mediaName || "file");
    if (signed) return NextResponse.redirect(signed);
    const buf = await readLocalObject(msg.mediaKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": msg.mediaMime || "application/octet-stream", "Cache-Control": "private, max-age=120" },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "שגיאה" }, { status });
  }
}
