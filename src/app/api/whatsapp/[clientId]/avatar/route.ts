import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { getWhatsappAvatar, clientWhatsappPhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// GET /api/whatsapp/[clientId]/avatar — מספר וטלפון + תמונת פרופיל בוואטסאפ של הלקוח.
export const GET = handle(async (_req, { params }: { params: { clientId: string } }) => {
  await requireAdmin();
  const client = await prisma.client.findUnique({ where: { id: params.clientId }, select: { id: true } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");
  const phone = await clientWhatsappPhone(params.clientId);
  const avatarUrl = phone ? await getWhatsappAvatar(phone) : null;
  return NextResponse.json({ phone, avatarUrl });
});
