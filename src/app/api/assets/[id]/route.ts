import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";

export const dynamic = "force-dynamic";

async function guard() {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "assets")) throw new ApiError(403, "אין הרשאה למודול הנכסים");
  return user;
}

const UpdateAsset = z.object({
  kind: z.enum(["business_manager", "page", "ad_account", "instagram", "google_ads", "other"]).optional(),
  name: z.string().max(200).nullable().optional(),
  externalId: z.string().max(120).nullable().optional(),
  ownership: z.enum(["client", "agency", "third_party"]).optional(),
  ownerNote: z.string().max(300).nullable().optional(),
  access: z.enum(["full", "partial", "none"]).optional(),
  accessUsers: z.string().max(400).nullable().optional(),
  role: z.string().max(120).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

// PATCH /api/assets/[id] — עדכון נכס רשום.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await guard();
  const b = UpdateAsset.parse(await readJson(req));
  const asset = await prisma.digitalAsset
    .update({ where: { id: params.id }, data: b })
    .catch(() => {
      throw new ApiError(404, "נכס לא נמצא");
    });
  return NextResponse.json({ asset });
});

// DELETE /api/assets/[id] — הסרת רישום (הנכס עצמו כמובן לא נמחק בפלטפורמה).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await guard();
  await prisma.digitalAsset.delete({ where: { id: params.id } }).catch(() => {
    throw new ApiError(404, "נכס לא נמצא");
  });
  return NextResponse.json({ ok: true });
});
