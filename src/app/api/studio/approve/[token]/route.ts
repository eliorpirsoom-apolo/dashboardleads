import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/studio/approve/[token] — תצוגת אישור ללקוח דרך קישור-קסם (ללא התחברות).
// חושף אך ורק את נתוני המשימה של הטוקן; אין גישה ללקוחות/משימות אחרים.
export const GET = handle(async (_req, { params }: { params: { token: string } }) => {
  if (!params.token || params.token.length < 20) throw new ApiError(404, "קישור לא תקין");
  const task = await prisma.designTask.findUnique({
    where: { approvalToken: params.token },
    select: {
      id: true,
      title: true,
      briefType: true,
      status: true,
      round: true,
      client: { select: { name: true } },
      assets: {
        where: { kind: "deliverable", fileKey: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { id: true, fileName: true, mimeType: true, round: true },
      },
      messages: {
        where: { channel: "client" },
        orderBy: { createdAt: "asc" },
        select: { id: true, assetId: true, authorSide: true, authorName: true, body: true, createdAt: true },
      },
      feedback: {
        orderBy: { createdAt: "desc" },
        select: { id: true, decision: true, text: true, round: true, createdAt: true },
      },
    },
  });
  if (!task) throw new ApiError(404, "קישור לא נמצא או שפג תוקפו");
  return NextResponse.json({
    task: {
      title: task.title,
      briefType: task.briefType,
      status: task.status,
      round: task.round,
      clientName: task.client?.name ?? null,
      assets: task.assets,
      messages: task.messages,
      feedback: task.feedback,
    },
  });
});
