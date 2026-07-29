import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, readJson, ApiError } from "@/lib/api";
import { sendMessage } from "@/lib/messaging";

export const dynamic = "force-dynamic";

const Feedback = z.object({
  decision: z.enum(["approved", "changes"]),
  text: z.string().max(3000).nullable().optional(),
});

// POST /api/design-tasks/[id]/feedback — הלקוח מאשר או מבקש שינויים (פידבק כתוב).
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const task = await prisma.designTask.findUnique({
    where: { id: params.id },
    include: { designer: { select: { name: true, email: true } } },
  });
  if (!task) throw new ApiError(404, "משימת עיצוב לא נמצאה");
  // גישה: המשרד, או הלקוח של המשימה בלבד.
  if (user.role !== "ADMIN" && user.clientId !== task.clientId) {
    throw new ApiError(403, "אין הרשאה");
  }
  if (task.status !== "sent_to_client") {
    throw new ApiError(400, "המשימה אינה ממתינה לאישור לקוח");
  }
  const b = Feedback.parse(await readJson(req));
  if (b.decision === "changes" && !b.text?.trim()) {
    throw new ApiError(422, "נא לפרט מה לתקן");
  }

  await prisma.designFeedback.create({
    data: {
      designTaskId: task.id,
      round: task.round,
      decision: b.decision,
      text: b.text?.trim() || null,
      authorName: user.name,
    },
  });

  // מעבר סטטוס: אושר → לאישור סופי; שינויים → חזרה לעבודה + סבב חדש.
  const updated = await prisma.designTask.update({
    where: { id: task.id },
    data:
      b.decision === "approved"
        ? { status: "final_review" }
        : { status: "in_progress", round: { increment: 1 } },
  });

  // התראה למעצב/ת (או למשרד) על תגובת הלקוח.
  const label = b.decision === "approved" ? "אישר/ה את העיצוב ✓" : "ביקש/ה תיקונים";
  const body =
    `הלקוח ${label} — "${task.title}".` + (b.text ? `\n\nהערות:\n${b.text.trim()}` : "");
  if (task.designer?.email) {
    await sendMessage({
      channel: "email",
      to: task.designer.email,
      subject: `סטודיו: ${label}`,
      body,
      kind: "automation",
      clientId: task.clientId,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, status: updated.status, round: updated.round });
});
