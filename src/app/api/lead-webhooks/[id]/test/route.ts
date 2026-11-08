import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { testLeadWebhook } from "@/lib/leadForward";

export const dynamic = "force-dynamic";

// POST /api/lead-webhooks/[id]/test — שליחת מעטפת-דוגמה ליעד (בדיקת חיבור).
export const POST = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireManager();
  const hook = await prisma.leadWebhook.findUnique({ where: { id: params.id } });
  if (!hook) throw new ApiError(404, "יעד לא נמצא");
  const r = await testLeadWebhook(hook.id);
  return NextResponse.json(r);
});
