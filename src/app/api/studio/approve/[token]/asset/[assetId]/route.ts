import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { presignDownload, readLocalObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET /api/studio/approve/[token]/asset/[assetId] — הגשת תוצר דרך קישור-קסם (ללא התחברות).
// מוגבל אך ורק לתוצרים (deliverable) של המשימה שאליה שייך הטוקן.
export async function GET(
  _req: Request,
  { params }: { params: { token: string; assetId: string } }
) {
  try {
    if (!params.token || params.token.length < 20) throw new ApiError(404, "קישור לא תקין");
    const task = await prisma.designTask.findUnique({
      where: { approvalToken: params.token },
      select: { id: true },
    });
    if (!task) throw new ApiError(404, "קישור לא נמצא");
    const asset = await prisma.designAsset.findFirst({
      where: { id: params.assetId, designTaskId: task.id, kind: "deliverable" },
    });
    if (!asset || !asset.fileKey) throw new ApiError(404, "תוצר לא נמצא");
    const signed = await presignDownload(asset.fileKey, asset.fileName || "asset");
    if (signed) return NextResponse.redirect(signed);
    const buf = await readLocalObject(asset.fileKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": asset.mimeType || "application/octet-stream",
        "Cache-Control": "private, max-age=120",
      },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "שגיאה" }, { status });
  }
}
