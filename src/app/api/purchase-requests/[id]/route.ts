import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const UpdateRequest = z.object({
  status: z.enum(["new", "approved", "rejected", "converted"]).optional(),
  amount: z.number().min(0).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  unitTypeId: z.string().nullable().optional(),
});

export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const existing = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "בקשה לא נמצאה");
  scopeClientId(user, existing.clientId);

  const body = UpdateRequest.parse(await readJson(req));
  const request = await prisma.purchaseRequest.update({
    where: { id: params.id },
    data: body,
  });
  return NextResponse.json({ request });
});

export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const existing = await prisma.purchaseRequest.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "בקשה לא נמצאה");
  scopeClientId(user, existing.clientId);
  await prisma.purchaseRequest.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
