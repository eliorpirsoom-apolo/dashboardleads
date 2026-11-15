import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ApiError } from "@/lib/api";
import { requireSocialAccess } from "@/lib/social/access";
import { generateSocialDraft } from "@/lib/social/drafts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/social/threads/:id/draft — יצירת טיוטה מחדש (ידני, מהתיבה).
// force: גם לפנייה שסומנה "דורש אדם" / "נענה". אין שליחה.
export const POST = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireSocialAccess();
  const exists = await prisma.socialThread.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!exists) throw new ApiError(404, "הפנייה לא נמצאה");
  const r = await generateSocialDraft(params.id, { force: true });
  return NextResponse.json({ ok: r.status !== "error", ...r });
});
