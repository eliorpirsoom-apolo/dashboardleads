import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson } from "@/lib/api";
import { requireManager } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const Update = z.object({ resolved: z.boolean() });

// PATCH /api/feedback/[id] — סימון טופל/לא טופל (מנהל בלבד).
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireManager();
  const body = Update.parse(await readJson(req));
  await prisma.feedback.update({ where: { id: params.id }, data: { resolved: body.resolved } });
  return NextResponse.json({ ok: true });
});

// DELETE /api/feedback/[id] — מחיקת משוב (מנהל בלבד).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireManager();
  await prisma.feedback.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
