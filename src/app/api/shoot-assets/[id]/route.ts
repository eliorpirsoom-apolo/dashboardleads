import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";
import { presignDownload, readLocalObject, deleteObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

function assertShootsModule(user: Parameters<typeof canAccessAdminModule>[0]) {
  if (user.role === "ADMIN" && !canAccessAdminModule(user, "shoots")) {
    throw new ApiError(403, "אין לך הרשאה למודול ימי צילום");
  }
}

// GET /api/shoot-assets/[id] — הגשת תוצר יום צילום (משרד בלבד, מודול ימי צילום).
// ?download=1 — הורדה כקובץ (attachment) במקום תצוגה בדפדפן.
export const GET = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireAdmin();
  assertShootsModule(user);
  const asDownload = new URL(req.url).searchParams.get("download") === "1";
  const asset = await prisma.shootAsset.findUnique({ where: { id: params.id } });
  if (!asset) throw new ApiError(404, "תוצר לא נמצא");

  // תוצר שהוא קישור חיצוני — הפניה אליו.
  if (asset.url) return NextResponse.redirect(asset.url);
  if (!asset.fileKey) throw new ApiError(404, "לתוצר אין קובץ");

  const signed = await presignDownload(
    asset.fileKey,
    asset.fileName || "asset",
    600,
    asDownload ? "attachment" : "inline"
  );
  if (signed) return NextResponse.redirect(signed);

  // מנוע מקומי (dev) — הזרמת הבייטים.
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
});

// DELETE /api/shoot-assets/[id] — מחיקת תוצר (+ הקובץ מהאחסון, best-effort).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireAdmin();
  assertShootsModule(user);
  const asset = await prisma.shootAsset.findUnique({ where: { id: params.id } });
  if (!asset) throw new ApiError(404, "תוצר לא נמצא");
  await prisma.shootAsset.delete({ where: { id: asset.id } });
  if (asset.fileKey) await deleteObject(asset.fileKey).catch(() => {}); // ניקוי האחסון
  return NextResponse.json({ ok: true, deleted: true });
});
