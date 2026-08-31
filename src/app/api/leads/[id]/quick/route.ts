import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { recordActivity, markLeadHandled } from "@/lib/leadActivity";

export const dynamic = "force-dynamic";

const Body = z.object({
  // no_answer: "חייגתי — אין מענה" — רישום + קביעת חזרה אוטומטית.
  // snooze: דחיית מועד החזרה הפתוח (או יצירתו) למועד חדש.
  action: z.enum(["no_answer", "snooze"]),
  followUpAt: z.string().min(1), // ISO — מתי לחזור לליד
});

// POST /api/leads/[id]/quick — פעולות מהירות על ליד (לחיצה אחת למשווק).
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const b = Body.parse(await readJson(req));
  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) throw new ApiError(404, "ליד לא נמצא");
  scopeClientId(user, lead.clientId);
  const followUpAt = new Date(b.followUpAt);
  if (isNaN(followUpAt.getTime())) throw new ApiError(400, "מועד לא תקין");

  // משימת החזרה הפתוחה של הליד — מועברת למועד החדש; אין כזו — נוצרת.
  const openTask = await prisma.task.findFirst({
    where: { leadId: lead.id, status: { in: ["open", "in_progress"] } },
    orderBy: { dueAt: "asc" },
  });
  let taskId: string;
  if (openTask) {
    await prisma.task.update({ where: { id: openTask.id }, data: { dueAt: followUpAt } });
    await prisma.reminder
      .updateMany({
        where: { taskId: openTask.id, status: "pending" },
        data: { remindAt: new Date(followUpAt.getTime() - 60 * 60_000) },
      })
      .catch(() => {});
    taskId = openTask.id;
  } else {
    const t = await prisma.task.create({
      data: {
        clientId: lead.clientId,
        leadId: lead.id,
        title: `חזרה לליד — ${lead.fullName ?? `#${lead.number}`}`,
        type: "callback",
        ownerSide: user.role === "ADMIN" ? "agency" : "client",
        assigneeId: lead.assigneeId ?? user.id,
        dueAt: followUpAt,
        createdById: user.id,
      },
    });
    taskId = t.id;
  }

  if (b.action === "no_answer") {
    await recordActivity(lead.id, user.name, "call_attempt", {
      note: "☎️ חייגתי — אין מענה",
    });
    await markLeadHandled(lead.id); // ניסיון חיוג = הליד טופל (עוצר את טיימר המענה)
  } else {
    await recordActivity(lead.id, user.name, "call_attempt", {
      note: "מועד החזרה לליד נדחה",
    });
  }

  return NextResponse.json({ ok: true, taskId, followUpAt });
});
