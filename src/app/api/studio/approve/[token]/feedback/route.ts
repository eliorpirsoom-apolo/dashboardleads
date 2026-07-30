import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { sendMessage } from "@/lib/messaging";

export const dynamic = "force-dynamic";

const Feedback = z.object({
  decision: z.enum(["approved", "changes"]),
  text: z.string().max(3000).nullable().optional(),
});

// POST /api/studio/approve/[token]/feedback — אישור/בקשת שינויים דרך קישור-קסם.
export const POST = handle(async (req, { params }: { params: { token: string } }) => {
  if (!params.token || params.token.length < 20) throw new ApiError(404, "קישור לא תקין");
  const task = await prisma.designTask.findUnique({
    where: { approvalToken: params.token },
    include: { client: { select: { name: true } }, designer: { select: { email: true } } },
  });
  if (!task) throw new ApiError(404, "קישור לא נמצא");
  if (task.status !== "sent_to_client") throw new ApiError(400, "המשימה אינה ממתינה לאישור כרגע");
  const b = Feedback.parse(await readJson(req));
  if (b.decision === "changes" && !b.text?.trim()) throw new ApiError(422, "נא לפרט מה לתקן");

  await prisma.designFeedback.create({
    data: {
      designTaskId: task.id,
      round: task.round,
      decision: b.decision,
      text: b.text?.trim() || null,
      authorName: task.client?.name || "הלקוח",
    },
  });
  const updated = await prisma.designTask.update({
    where: { id: task.id },
    data:
      b.decision === "approved"
        ? { status: "final_review" }
        : { status: "in_progress", round: { increment: 1 } },
  });

  const label = b.decision === "approved" ? "אישר/ה את העיצוב ✓" : "ביקש/ה תיקונים";
  if (task.designer?.email) {
    await sendMessage({
      channel: "email",
      to: task.designer.email,
      subject: `סטודיו: ${label}`,
      body: `הלקוח ${label} — "${task.title}".` + (b.text ? `\n\nהערות:\n${b.text.trim()}` : ""),
      kind: "automation",
      clientId: task.clientId,
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true, status: updated.status, round: updated.round });
});
