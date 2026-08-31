import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";
import { presignDownload, readLocalObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET /api/organic/[id]/image?i=0 — הגשת צילום מסך של פעולת קידום (משרד בלבד).
export const GET = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "organic")) throw new ApiError(403, "אין הרשאה למודול קידום אורגני");
  const i = Number(new URL(req.url).searchParams.get("i") || 0);
  const action = await prisma.seoAction.findUnique({ where: { id: params.id }, select: { images: true } });
  if (!action?.images) throw new ApiError(404, "אין תמונות לפעולה");
  let list: { key: string; name: string }[] = [];
  try {
    list = JSON.parse(action.images);
  } catch {
    /* JSON פגום */
  }
  const img = list[i];
  if (!img?.key) throw new ApiError(404, "תמונה לא נמצאה");
  const signed = await presignDownload(img.key, img.name || "image");
  if (signed) return NextResponse.redirect(signed);
  const buf = await readLocalObject(img.key);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" },
  });
});
