import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { deleteObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

// DELETE /api/signed-quotes/[id] — מחיקת הצעת מחיר חתומה + הקובץ (מנהל בלבד).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireManager();
  const q = await prisma.signedQuote.findUnique({ where: { id: params.id } });
  if (!q) throw new ApiError(404, "לא נמצא");
  await deleteObject(q.fileKey).catch(() => {});
  await prisma.signedQuote.delete({ where: { id: q.id } });
  return NextResponse.json({ ok: true, deleted: true });
});

const Patch = z.object({
  title: z.string().max(120).nullable().optional(),
  amountPreVat: z.number().int().min(0).max(100000000).nullable().optional(),
  amountTotal: z.number().int().min(0).max(100000000).nullable().optional(),
  quoteDate: z.string().datetime().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

// PATCH /api/signed-quotes/[id] — עריכת פרטי ההצעה (נושא/סכום/תאריך/הערה). מנהל בלבד.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireManager();
  const q = await prisma.signedQuote.findUnique({ where: { id: params.id } });
  if (!q) throw new ApiError(404, "לא נמצא");
  const b = Patch.parse(await readJson(req));
  const data: Record<string, unknown> = {};
  if ("title" in b) data.title = b.title || null;
  if ("amountPreVat" in b) data.amountPreVat = b.amountPreVat ?? null;
  if ("amountTotal" in b) data.amountTotal = b.amountTotal ?? null;
  if ("note" in b) data.note = b.note || null;
  if ("quoteDate" in b) data.quoteDate = b.quoteDate ? new Date(b.quoteDate) : null;
  await prisma.signedQuote.update({ where: { id: q.id }, data });
  return NextResponse.json({ ok: true });
});
