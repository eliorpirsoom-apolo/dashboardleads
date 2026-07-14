import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

async function ownStatus(userClientId: string, id: string) {
  const status = await prisma.leadStatus.findUnique({ where: { id } });
  if (!status || status.clientId !== userClientId) {
    throw new ApiError(404, "סטטוס לא נמצא");
  }
  return status;
}

const UpdateStatus = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  systemKind: z.enum(["new", "in_progress", "won", "lost"]).optional(),
  order: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
});

export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const existing = await prisma.leadStatus.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "סטטוס לא נמצא");
  const clientId = scopeClientId(user, existing.clientId);
  await ownStatus(clientId, params.id);

  const body = UpdateStatus.parse(await readJson(req));

  const status = await prisma.$transaction(async (tx) => {
    if (body.isDefault) {
      await tx.leadStatus.updateMany({
        where: { clientId },
        data: { isDefault: false },
      });
    }
    return tx.leadStatus.update({ where: { id: params.id }, data: body });
  });
  return NextResponse.json({ status });
});

export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const existing = await prisma.leadStatus.findUnique({
    where: { id: params.id },
    include: { _count: { select: { leads: true } } },
  });
  if (!existing) throw new ApiError(404, "סטטוס לא נמצא");
  scopeClientId(user, existing.clientId);

  if (existing._count.leads > 0) {
    throw new ApiError(
      409,
      `אי אפשר למחוק: ${existing._count.leads} לידים נמצאים בסטטוס הזה. העבירו אותם קודם לסטטוס אחר.`
    );
  }
  await prisma.leadStatus.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
