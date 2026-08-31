import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const UpdateQuote = z.object({
  recipient: z.string().min(1).max(160).optional(),
  title: z.string().min(1).max(200).optional(),
  amount: z.number().min(0).nullable().optional(),
  // המחיר בפועל (נחתם) — ריטיינר חודשי / חד-פעמי; ניתן לעדכון בכל שלב.
  approvedRetainer: z.number().min(0).nullable().optional(),
  approvedOneoff: z.number().min(0).nullable().optional(),
  clientId: z.string().nullable().optional(),
  status: z.enum(["sent", "followup", "won", "lost"]).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

// PATCH /api/quotes/[id] — עדכון סטטוס/פרטים. כל עדכון מרענן את שעון
// ה"ימים ללא מענה" (updatedAt).
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const body = UpdateQuote.parse(await readJson(req));
  const existing = await prisma.quote.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "הצעת מחיר לא נמצאה");
  if (body.clientId) {
    const client = await prisma.client.findUnique({ where: { id: body.clientId } });
    if (!client) throw new ApiError(404, "לקוח לא נמצא");
  }

  const quote = await prisma.quote.update({
    where: { id: params.id },
    data: body,
  });
  return NextResponse.json({ quote });
});

export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const existing = await prisma.quote.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "הצעת מחיר לא נמצאה");
  await prisma.quote.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
