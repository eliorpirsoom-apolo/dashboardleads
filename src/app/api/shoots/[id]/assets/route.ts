import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";

export const dynamic = "force-dynamic";

// עובד-משרד שהוגבל ממודול "ימי צילום" נחסם גם ב-API.
function assertShootsModule(user: Parameters<typeof canAccessAdminModule>[0]) {
  if (user.role === "ADMIN" && !canAccessAdminModule(user, "shoots")) {
    throw new ApiError(403, "אין לך הרשאה למודול ימי צילום");
  }
}

function shapeAsset(a: any) {
  return {
    id: a.id,
    fileKey: a.fileKey,
    url: a.url,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    note: a.note,
    uploadedBy: a.uploadedBy?.name ?? null,
    createdAt: a.createdAt,
  };
}

// GET /api/shoots/[id]/assets — רשימת התוצרים הסופיים של יום הצילום (חדש-למעלה).
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireAdmin();
  assertShootsModule(user);
  const shoot = await prisma.shootDay.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!shoot) throw new ApiError(404, "יום צילום לא נמצא");
  const assets = await prisma.shootAsset.findMany({
    where: { shootId: shoot.id },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });
  return NextResponse.json({ assets: assets.map(shapeAsset) });
});

const AddAsset = z
  .object({
    fileKey: z.string().min(1).max(400).nullable().optional(),
    url: z.string().url("קישור לא תקין").max(1000).nullable().optional(),
    fileName: z.string().min(1).max(200),
    mimeType: z.string().max(100).nullable().optional(),
    size: z.number().int().min(0).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((b) => Boolean(b.fileKey) || Boolean(b.url), {
    message: "חובה לצרף קובץ או קישור",
  });

// POST /api/shoots/[id]/assets — רישום תוצר: קובץ שהועלה (דרך /api/uploads) או קישור.
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireAdmin();
  assertShootsModule(user);
  const shoot = await prisma.shootDay.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!shoot) throw new ApiError(404, "יום צילום לא נמצא");
  const b = AddAsset.parse(await readJson(req));

  const asset = await prisma.shootAsset.create({
    data: {
      shootId: shoot.id,
      fileKey: b.fileKey || null,
      url: b.url || null,
      fileName: b.fileName,
      mimeType: b.mimeType || null,
      size: b.size ?? null,
      note: b.note || null,
      uploadedById: user.id,
    },
    include: { uploadedBy: { select: { name: true } } },
  });
  return NextResponse.json({ asset: shapeAsset(asset) }, { status: 201 });
});
