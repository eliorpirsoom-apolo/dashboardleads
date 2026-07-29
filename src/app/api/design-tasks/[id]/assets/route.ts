import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const AddAsset = z.object({
  fileKey: z.string().min(1).max(400),
  fileName: z.string().max(200),
  mimeType: z.string().max(100).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

// POST /api/design-tasks/[id]/assets — רישום תוצר שהועלה (דרך /api/uploads/direct).
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireAdmin();
  const task = await prisma.designTask.findUnique({ where: { id: params.id } });
  if (!task) throw new ApiError(404, "משימת עיצוב לא נמצאה");
  const b = AddAsset.parse(await readJson(req));

  const asset = await prisma.designAsset.create({
    data: {
      designTaskId: task.id,
      round: task.round,
      fileKey: b.fileKey,
      fileName: b.fileName,
      mimeType: b.mimeType || null,
      note: b.note || null,
      uploadedById: user.id,
    },
  });
  return NextResponse.json({ asset }, { status: 201 });
});
