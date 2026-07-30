import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { sendWhatsappRaw, whatsappConfigured, clientWhatsappPhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// GET /api/whatsapp/[clientId] — שרשור שיחת הוואטסאפ של הלקוח (מוקדם→מאוחר).
export const GET = handle(async (_req, { params }: { params: { clientId: string } }) => {
  await requireAdmin();
  const client = await prisma.client.findUnique({ where: { id: params.clientId }, select: { id: true } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");
  const [messages, phone] = await Promise.all([
    prisma.whatsappMessage.findMany({ where: { clientId: params.clientId }, orderBy: { createdAt: "asc" }, take: 500 }),
    clientWhatsappPhone(params.clientId),
  ]);
  return NextResponse.json({ messages, phone, configured: whatsappConfigured() });
});

const Send = z.object({ body: z.string().min(1, "הודעה ריקה").max(4000) });

// POST /api/whatsapp/[clientId] — שליחת הודעת וואטסאפ ללקוח + שמירה בשרשור.
export const POST = handle(async (req, { params }: { params: { clientId: string } }) => {
  const user = await requireAdmin();
  const client = await prisma.client.findUnique({ where: { id: params.clientId }, select: { id: true } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");
  if (!whatsappConfigured()) throw new ApiError(400, "וואטסאפ אינו מוגדר במערכת");
  const b = Send.parse(await readJson(req));
  const body = b.body.trim();
  if (!body) throw new ApiError(422, "הודעה ריקה");
  const phone = await clientWhatsappPhone(params.clientId);
  if (!phone) throw new ApiError(400, "אין מספר טלפון ללקוח — הוסיפו בכרטיס הלקוח");

  const sent = await sendWhatsappRaw(phone, body);
  if (!sent.ok) throw new ApiError(502, sent.error || "שליחת הוואטסאפ נכשלה");

  const message = await prisma.whatsappMessage.create({
    data: {
      clientId: params.clientId,
      direction: "out",
      body,
      authorName: user.name,
      waMessageId: sent.idMessage || null,
    },
  });
  return NextResponse.json({ message }, { status: 201 });
});
