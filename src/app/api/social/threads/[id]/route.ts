import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ApiError } from "@/lib/api";
import { requireSocialAccess } from "@/lib/social/access";

export const dynamic = "force-dynamic";

// GET /api/social/threads/:id — פנייה אחת עם כל ההודעות (ישן → חדש). קריאה בלבד.
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireSocialAccess();
  const thread = await prisma.socialThread.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      platform: true,
      kind: true,
      status: true,
      needsHuman: true,
      reason: true,
      draftText: true,
      draftAt: true,
      externalId: true,
      postId: true,
      permalink: true,
      authorName: true,
      authorExtId: true,
      lastInboundAt: true,
      lastMessageAt: true,
      createdAt: true,
      client: { select: { id: true, name: true, color: true } },
      account: { select: { id: true, pageName: true, igUsername: true, pageId: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          direction: true,
          text: true,
          authorName: true,
          sentAt: true,
          createdAt: true,
        },
      },
    },
  });
  if (!thread) throw new ApiError(404, "הפנייה לא נמצאה");
  return NextResponse.json({ thread });
});
