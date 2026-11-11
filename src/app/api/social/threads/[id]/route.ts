import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, ApiError, readJson } from "@/lib/api";
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
      draftError: true,
      aiCategory: true,
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

const PatchBody = z.object({
  // שינוי סטטוס ידני בלבד (שלב 1b): דורש אדם / התעלמות / פתיחה מחדש.
  status: z.enum(["open", "needs_human", "ignored"]),
  reason: z.string().max(300).optional(),
});

// PATCH /api/social/threads/:id — סימון ידני. אין שליחה, אין מחיקה.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireSocialAccess();
  const b = PatchBody.parse(await readJson(req));
  const t = await prisma.socialThread.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!t) throw new ApiError(404, "הפנייה לא נמצאה");
  const updated = await prisma.socialThread.update({
    where: { id: params.id },
    data: {
      status: b.status,
      needsHuman: b.status === "needs_human",
      reason: b.status === "needs_human" ? b.reason?.trim() || "סומן ידנית" : null,
      // פתיחה מחדש משאירה את הטיוטה הקיימת (אם יש) — הקרון/כפתור ירעננו אותה.
    },
    select: { id: true, status: true, needsHuman: true, reason: true },
  });
  return NextResponse.json({ ok: true, thread: updated });
});
