import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/lead-webhooks/[id]/logs — 30 המסירות האחרונות של היעד (חדש-למעלה).
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const hook = await prisma.leadWebhook.findUnique({ where: { id: params.id } });
  if (!hook) throw new ApiError(404, "יעד לא נמצא");
  const logs = await prisma.leadForwardLog.findMany({
    where: { webhookId: hook.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json({ logs });
});
