import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { presignDownload } from "@/lib/storage";
import { sendWhatsappFile, whatsappConfigured, clientWhatsappPhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const Body = z.object({
  assetId: z.string().optional(), // תוצר עיצוב קיים
  fileKey: z.string().max(400).optional(), // קובץ שהועלה (צילום מסך/סימון)
  fileName: z.string().max(200).optional(),
  mimeType: z.string().max(100).nullable().optional(),
  caption: z.string().max(1000).optional(),
});

// POST /api/whatsapp/[clientId]/media — שליחת מדיה בוואטסאפ ללקוח (תוצר או קובץ שהועלה).
export const POST = handle(async (req, { params }: { params: { clientId: string } }) => {
  const user = await requireAdmin();
  const client = await prisma.client.findUnique({ where: { id: params.clientId }, select: { id: true } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");
  if (!whatsappConfigured()) throw new ApiError(400, "וואטסאפ אינו מוגדר במערכת");
  const b = Body.parse(await readJson(req));

  let fileKey: string;
  let fileName: string;
  let mimeType: string | null;
  if (b.assetId) {
    const asset = await prisma.designAsset.findFirst({
      where: { id: b.assetId, designTask: { clientId: params.clientId } },
      select: { fileKey: true, fileName: true, mimeType: true },
    });
    if (!asset?.fileKey) throw new ApiError(404, "תוצר לא נמצא");
    fileKey = asset.fileKey;
    fileName = asset.fileName || "file";
    mimeType = asset.mimeType || null;
  } else if (b.fileKey) {
    // קובץ שהועלה דרך /api/uploads/direct — חייב להיות תחת התיקייה של הלקוח.
    if (!b.fileKey.includes(params.clientId)) throw new ApiError(403, "קובץ לא מורשה");
    fileKey = b.fileKey;
    fileName = b.fileName || "file";
    mimeType = b.mimeType || null;
  } else {
    throw new ApiError(400, "חסר קובץ לשליחה");
  }

  const phone = await clientWhatsappPhone(params.clientId);
  if (!phone) throw new ApiError(400, "אין מספר טלפון ללקוח");
  const urlFile = await presignDownload(fileKey, fileName);
  if (!urlFile) throw new ApiError(500, "לא ניתן להפיק קישור לקובץ");

  const sent = await sendWhatsappFile(phone, urlFile, fileName, b.caption);
  if (!sent.ok) throw new ApiError(502, sent.error || "שליחת המדיה נכשלה");

  const message = await prisma.whatsappMessage.create({
    data: {
      clientId: params.clientId,
      direction: "out",
      body: b.caption?.trim() || fileName,
      authorName: user.name,
      waMessageId: sent.idMessage || null,
      mediaKey: fileKey,
      mediaName: fileName,
      mediaMime: mimeType,
    },
  });
  return NextResponse.json({ message }, { status: 201 });
});
