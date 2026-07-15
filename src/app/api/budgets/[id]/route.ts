import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const UpdateBudget = z.object({
  amount: z.number().min(0).optional(),
  spend: z.number().min(0).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  assertNotAgent(user);
  const existing = await prisma.budget.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "תקציב לא נמצא");
  scopeClientId(user, existing.clientId);

  const body = UpdateBudget.parse(await readJson(req));
  const budget = await prisma.budget.update({ where: { id: params.id }, data: body });
  return NextResponse.json({ budget });
});

export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  assertNotAgent(user);
  const existing = await prisma.budget.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "תקציב לא נמצא");
  scopeClientId(user, existing.clientId);
  await prisma.budget.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
