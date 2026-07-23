import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// הצעות מחיר של המשרד — צד משרד בלבד.
// "פתוחה" = נשלחה או במעקב; נסגרת כ"אושרה"/"נדחתה".

// GET /api/quotes?status=open|sent|followup|won|lost|all
export const GET = handle(async (req) => {
  await requireAdmin();
  const status = new URL(req.url).searchParams.get("status") ?? "open";
  const where =
    status === "all"
      ? {}
      : status === "open"
        ? { status: { in: ["sent", "followup"] } }
        : { status };

  const quotes = await prisma.quote.findMany({
    where,
    // תמיד מהתאריך החדש ביותר לישן ביותר.
    orderBy: { sentAt: "desc" },
    take: 200,
    include: { client: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ quotes });
});

const CreateQuote = z.object({
  recipient: z.string().min(1, "חסר שם נמען").max(160),
  title: z.string().min(1, "חסר נושא").max(200),
  amount: z.number().min(0).nullable().optional(),
  clientId: z.string().nullable().optional(),
  sentAt: z.string().optional(), // yyyy-mm-dd
  notes: z.string().max(2000).nullable().optional(),
  fileKey: z.string().max(400).nullable().optional(),
  fileName: z.string().max(200).nullable().optional(),
  mimeType: z.string().max(100).nullable().optional(),
});

// POST /api/quotes — רישום הצעה (הקובץ הועלה קודם דרך presign).
export const POST = handle(async (req) => {
  await requireAdmin();
  const body = CreateQuote.parse(await readJson(req));

  if (body.clientId) {
    const client = await prisma.client.findUnique({ where: { id: body.clientId } });
    if (!client) throw new ApiError(404, "לקוח לא נמצא");
  }
  if (body.fileKey && !body.fileKey.startsWith("agency/quotes/")) {
    throw new ApiError(403, "מפתח קובץ לא תקין להצעת מחיר");
  }

  const quote = await prisma.quote.create({
    data: {
      recipient: body.recipient,
      title: body.title,
      amount: body.amount ?? null,
      clientId: body.clientId || null,
      sentAt: body.sentAt ? new Date(`${body.sentAt}T12:00:00Z`) : new Date(),
      notes: body.notes || null,
      fileKey: body.fileKey || null,
      fileName: body.fileName || null,
      mimeType: body.mimeType || null,
    },
  });
  return NextResponse.json({ quote }, { status: 201 });
});
