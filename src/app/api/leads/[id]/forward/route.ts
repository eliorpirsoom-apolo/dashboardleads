import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { forwardLeadOutbound } from "@/lib/leadForward";

export const dynamic = "force-dynamic";

// POST /api/leads/[id]/forward — שיגור ידני חוזר של ליד לכל היעדים המתאימים.
export const POST = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireManager();
  const lead = await prisma.lead.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!lead) throw new ApiError(404, "ליד לא נמצא");
  const r = await forwardLeadOutbound(lead.id);
  return NextResponse.json(r);
});
