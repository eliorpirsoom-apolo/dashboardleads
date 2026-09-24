import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, ApiError } from "@/lib/api";
import { presignDownload, readLocalObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET /api/meetings/[id]/photo?key=... — הגשת תמונת המקור של הפגישה.
// רק מפתחות ששייכים לסיכום הזה (מונע גישה חופשית לאחסון). צד משרד בלבד.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    if (user.role !== "ADMIN") throw new ApiError(403, "צד משרד בלבד");
    const key = new URL(req.url).searchParams.get("key");
    if (!key) throw new ApiError(400, "חסר key");
    const m = await prisma.meetingSummary.findUnique({
      where: { id: params.id },
      select: { photoKeys: true },
    });
    const keys: string[] = (() => {
      try {
        return JSON.parse(m?.photoKeys || "[]");
      } catch {
        return [];
      }
    })();
    if (!m || !keys.includes(key)) throw new ApiError(404, "תמונה לא נמצאה");

    const signed = await presignDownload(key, "image");
    if (signed) return NextResponse.redirect(signed);
    const buf = await readLocalObject(key);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof ApiError ? err.message : "שגיאה" },
      { status }
    );
  }
}
