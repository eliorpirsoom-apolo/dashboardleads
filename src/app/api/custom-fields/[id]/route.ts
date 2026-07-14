import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const UpdateField = z.object({
  label: z.string().min(1).max(80).optional(),
  options: z.array(z.string().min(1).max(80)).max(30).optional(),
  order: z.number().int().min(0).optional(),
});

export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const existing = await prisma.customFieldDef.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "שדה לא נמצא");
  scopeClientId(user, existing.clientId);

  const body = UpdateField.parse(await readJson(req));
  const field = await prisma.customFieldDef.update({
    where: { id: params.id },
    data: {
      label: body.label,
      order: body.order,
      ...(body.options ? { options: JSON.stringify(body.options) } : {}),
    },
  });
  return NextResponse.json({ field });
});

// DELETE — soft: hides the field, keeps values in existing leads' data.
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const existing = await prisma.customFieldDef.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "שדה לא נמצא");
  scopeClientId(user, existing.clientId);

  await prisma.customFieldDef.update({
    where: { id: params.id },
    data: { active: false },
  });
  return NextResponse.json({ ok: true });
});
