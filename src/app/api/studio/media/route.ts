import { NextResponse } from "next/server";
import { requireUser, ApiError } from "@/lib/api";
import { presignDownload, readLocalObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET /api/studio/media?key=... — הגשת תמונה מוטבעת בבריף/עדכונים (צד משרד בלבד).
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "ADMIN") throw new ApiError(403, "צד משרד בלבד");
    const key = new URL(req.url).searchParams.get("key");
    if (!key) throw new ApiError(400, "חסר key");
    const signed = await presignDownload(key, "image");
    if (signed) return NextResponse.redirect(signed);
    const buf = await readLocalObject(key);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "שגיאה" }, { status });
  }
}
