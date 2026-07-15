import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const UpdateContract = z.object({
  value: z.number().min(0).optional(),
  signedAt: z.string().nullable().optional(),
  documentId: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  assertNotAgent(user);
  const existing = await prisma.contract.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "חוזה לא נמצא");
  scopeClientId(user, existing.clientId);

  const body = UpdateContract.parse(await readJson(req));
  const contract = await prisma.contract.update({
    where: { id: params.id },
    data: {
      value: body.value,
      signedAt: body.signedAt === undefined ? undefined : body.signedAt ? new Date(body.signedAt) : null,
      documentId: body.documentId,
      notes: body.notes,
    },
  });
  return NextResponse.json({ contract });
});

export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  assertNotAgent(user);
  const existing = await prisma.contract.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "חוזה לא נמצא");
  scopeClientId(user, existing.clientId);
  await prisma.contract.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
