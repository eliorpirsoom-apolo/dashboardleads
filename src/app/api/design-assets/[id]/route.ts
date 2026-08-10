import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, ApiError, handle, scopeClientId } from "@/lib/api";
import { presignDownload, readLocalObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET /api/design-assets/[id] — הגשת תוצר עיצוב (משרד, או הלקוח של המשימה).
// ?download=1 — הורדה כקובץ (attachment) במקום תצוגה בדפדפן.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const asDownload = new URL(req.url).searchParams.get("download") === "1";
    const asset = await prisma.designAsset.findUnique({
      where: { id: params.id },
      include: { designTask: { select: { clientId: true } } },
    });
    if (!asset || !asset.fileKey) throw new ApiError(404, "תוצר לא נמצא");
    if (user.role !== "ADMIN" && user.clientId !== asset.designTask.clientId) {
      throw new ApiError(403, "אין הרשאה");
    }
    const signed = await presignDownload(
      asset.fileKey,
      asset.fileName || "asset",
      600,
      asDownload ? "attachment" : "inline"
    );
    if (signed) return NextResponse.redirect(signed);
    const buf = await readLocalObject(asset.fileKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": asset.mimeType || "application/octet-stream",
        "Cache-Control": "private, max-age=120",
        ...(asDownload
          ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(asset.fileName || "asset")}` }
          : {}),
      },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof ApiError ? err.message : "שגיאה" },
      { status }
    );
  }
}

// DELETE /api/design-assets/[id] — מחיקת תוצר (משרד בלבד).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ApiError(403, "צד משרד בלבד");
  const asset = await prisma.designAsset.findUnique({ where: { id: params.id } });
  if (!asset) throw new ApiError(404, "תוצר לא נמצא");
  await prisma.designAsset.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
