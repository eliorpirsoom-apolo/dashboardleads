import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/signed-quotes?clientId= — הצעות המחיר החתומות של לקוח (מנהל בלבד).
export const GET = handle(async (req) => {
  await requireManager();
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) throw new ApiError(400, "חסר מזהה לקוח");
  const rows = await prisma.signedQuote.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  const uploaderIds = [...new Set(rows.map((r) => r.uploadedById).filter(Boolean) as string[])];
  const users = uploaderIds.length
    ? await prisma.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = (id: string | null) => (id ? users.find((u) => u.id === id)?.name ?? null : null);
  const isImage = (m: string) => m.startsWith("image/");
  return NextResponse.json({
    quotes: rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      mimeType: r.mimeType,
      size: r.size,
      note: r.note,
      source: r.source,
      uploadedBy: nameOf(r.uploadedById),
      isImage: isImage(r.mimeType),
      url: `/api/signed-quotes/${r.id}/file`,
      createdAt: r.createdAt,
    })),
  });
});

const Create = z.object({
  clientId: z.string().min(1),
  fileKey: z.string().min(1).max(400),
  fileName: z.string().max(200),
  mimeType: z.string().max(100),
  size: z.number().int().min(0).optional(),
  note: z.string().max(500).nullable().optional(),
  source: z.enum(["manual", "whatsapp"]).default("manual"),
});

// POST /api/signed-quotes — רישום קובץ שהועלה כהצעת מחיר חתומה (מנהל בלבד).
export const POST = handle(async (req) => {
  const actor = await requireManager();
  const b = Create.parse(await readJson(req));
  const client = await prisma.client.findUnique({ where: { id: b.clientId } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");
  if (!b.fileKey.startsWith("agency/signed-quotes/")) throw new ApiError(400, "מפתח קובץ לא תקין");
  const quote = await prisma.signedQuote.create({
    data: {
      clientId: b.clientId,
      fileKey: b.fileKey,
      fileName: b.fileName,
      mimeType: b.mimeType,
      size: b.size ?? 0,
      note: b.note || null,
      source: b.source,
      uploadedById: actor.id,
    },
  });
  return NextResponse.json({ quote: { id: quote.id } }, { status: 201 });
});
