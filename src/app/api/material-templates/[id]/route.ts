import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const UpdateTemplate = z.object({
  name: z.string().min(1).max(120).optional(),
  items: z.array(z.string().max(300)).max(60).optional(),
});

export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireManager();
  const body = UpdateTemplate.parse(await readJson(req));
  const existing = await prisma.materialTemplate.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "תבנית לא נמצאה");
  const template = await prisma.materialTemplate.update({
    where: { id: params.id },
    data: {
      name: body.name,
      ...(body.items ? { items: JSON.stringify(body.items) } : {}),
    },
  });
  return NextResponse.json({ template });
});

export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireManager();
  await prisma.materialTemplate.deleteMany({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
