import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { notifyNewDesignMessage } from "@/lib/studioLinks";

export const dynamic = "force-dynamic";

const NewMessage = z.object({
  body: z.string().min(1, "הודעה ריקה").max(3000),
  assetId: z.string().nullable().optional(),
});

// POST /api/studio/approve/[token]/message — הודעת לקוח דרך קישור-קסם (צ'אט/הערה על תוצר).
export const POST = handle(async (req, { params }: { params: { token: string } }) => {
  if (!params.token || params.token.length < 20) throw new ApiError(404, "קישור לא תקין");
  const task = await prisma.designTask.findUnique({
    where: { approvalToken: params.token },
    select: { id: true, client: { select: { name: true } } },
  });
  if (!task) throw new ApiError(404, "קישור לא נמצא");
  const b = NewMessage.parse(await readJson(req));
  const body = b.body.trim();
  if (!body) throw new ApiError(422, "הודעה ריקה");
  if (b.assetId) {
    const asset = await prisma.designAsset.findFirst({
      where: { id: b.assetId, designTaskId: task.id },
      select: { id: true },
    });
    if (!asset) throw new ApiError(404, "תוצר לא נמצא");
  }
  const message = await prisma.designMessage.create({
    data: {
      designTaskId: task.id,
      assetId: b.assetId || null,
      authorSide: "client",
      authorName: task.client?.name || "הלקוח",
      body,
    },
  });
  notifyNewDesignMessage(task.id, "client", body).catch((e) => console.error("[studio:msg-notify]", e));
  return NextResponse.json({ message }, { status: 201 });
});
