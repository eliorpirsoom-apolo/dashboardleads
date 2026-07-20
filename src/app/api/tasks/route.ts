import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, readJson, ApiError } from "@/lib/api";
import { allowedProjectIds } from "@/lib/projectScope";

export const dynamic = "force-dynamic";

// GET /api/tasks?from&to&clientId&ownerSide&status&type
// ADMIN: everything (filterable). CLIENT: only its own client-side tasks.
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;

  const where: Prisma.TaskWhereInput = {};
  if (user.role === "ADMIN") {
    if (p.get("clientId")) where.clientId = p.get("clientId")!;
    if (p.get("ownerSide")) where.ownerSide = p.get("ownerSide")!;
  } else {
    // הפרדת הצדדים: לקוח רואה רק את המשימות של הצד שלו.
    where.clientId = user.clientId!;
    where.ownerSide = "client";
    // סוכן-פרויקטים: המשימות שלו או של לידים בפרויקטים שלו.
    const allowed = await allowedProjectIds(user);
    if (allowed) {
      where.OR = [
        { assigneeId: user.id },
        { createdById: user.id },
        { lead: { projectId: { in: allowed } } },
      ];
    }
  }
  if (p.get("status")) where.status = p.get("status")!;
  if (p.get("type")) where.type = p.get("type")!;
  if (p.get("assigneeId")) where.assigneeId = p.get("assigneeId")!;
  const from = p.get("from");
  const to = p.get("to");
  if (from || to) {
    where.dueAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
    };
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { dueAt: "asc" },
    take: 500,
    include: {
      assignee: { select: { id: true, name: true } },
      client: { select: { id: true, name: true, color: true } },
      lead: { select: { id: true, fullName: true, number: true } },
      reminders: { select: { id: true, channel: true, remindAt: true, status: true } },
    },
  });
  return NextResponse.json({ tasks });
});

const CreateTask = z.object({
  clientId: z.string().nullable().optional(),
  title: z.string().min(1, "חסרה כותרת").max(200),
  description: z.string().max(2000).nullable().optional(),
  type: z.enum(["task", "meeting"]).default("task"),
  ownerSide: z.enum(["agency", "client"]).default("agency"),
  assigneeId: z.string().nullable().optional(),
  leadId: z.string().nullable().optional(),
  dueAt: z.string().min(1, "חסר מועד"),
  durationMin: z.number().int().min(5).max(720).nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  reminder: z
    .object({
      channel: z.enum(["email", "sms", "whatsapp"]),
      minutesBefore: z.number().int().min(0).max(60 * 24 * 14),
    })
    .nullable()
    .optional(),
});

// POST /api/tasks — create task/meeting with optional reminder.
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = CreateTask.parse(await readJson(req));

  let clientId = body.clientId ?? null;
  let ownerSide = body.ownerSide;
  if (user.role !== "ADMIN") {
    clientId = user.clientId!;
    ownerSide = "client"; // client users create client-side tasks only
  }

  // Cross-checks: assignee/lead must belong to the same client scope.
  if (body.assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId } });
    if (!assignee) throw new ApiError(400, "משתמש משויך לא נמצא");
    if (user.role !== "ADMIN" && assignee.clientId !== user.clientId) {
      throw new ApiError(403, "אי אפשר לשייך משימה למשתמש של לקוח אחר");
    }
  }
  if (body.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: body.leadId } });
    if (!lead) throw new ApiError(400, "ליד לא נמצא");
    if (user.role !== "ADMIN" && lead.clientId !== user.clientId) {
      throw new ApiError(403, "ליד של לקוח אחר");
    }
    clientId = lead.clientId;
  }

  const dueAt = new Date(body.dueAt);
  if (isNaN(dueAt.getTime())) throw new ApiError(400, "מועד לא תקין");

  const task = await prisma.task.create({
    data: {
      clientId,
      title: body.title,
      description: body.description || null,
      type: body.type,
      ownerSide,
      assigneeId: body.assigneeId || null,
      leadId: body.leadId || null,
      dueAt,
      durationMin: body.durationMin ?? (body.type === "meeting" ? 60 : null),
      location: body.location || null,
      createdById: user.id,
      ...(body.reminder
        ? {
            reminders: {
              create: {
                channel: body.reminder.channel,
                remindAt: new Date(
                  dueAt.getTime() - body.reminder.minutesBefore * 60_000
                ),
              },
            },
          }
        : {}),
    },
    include: { reminders: true },
  });

  return NextResponse.json({ task }, { status: 201 });
});
