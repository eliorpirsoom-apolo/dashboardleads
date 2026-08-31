import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, readJson, ApiError } from "@/lib/api";
import { allowedProjectIds } from "@/lib/projectScope";
import { createTaskEvent } from "@/lib/gcal";
import { getTaskAgentConfig } from "@/lib/taskAgent";
import { sendWhatsappToChat } from "@/lib/whatsapp";
import { formatDateTime } from "@/lib/format";

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
  // "task"|"meeting" קיימים; "callback"=חזרה לליד, "contract"=תאריך חוזה.
  type: z.enum(["task", "meeting", "callback", "contract"]).default("task"),
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
  // ריבוי ערוצי תזכורת (SMS/וואטסאפ/מייל — גם וגם) במועד אחיד.
  reminderChannels: z.array(z.enum(["email", "sms", "whatsapp"])).optional(),
  reminderMinutesBefore: z.number().int().min(0).max(60 * 24 * 14).optional(),
  // למי לשלוח את התזכורת: הסוכן/משרד ו/או הליד עצמו.
  reminderTargets: z.array(z.enum(["agent", "lead"])).optional(),
  priority: z.enum(["low", "normal", "urgent"]).optional(),
  // 👥 זימון צוות: עותק לכל משתתף/ת + הודעה ותזכורת בקבוצת המשרד.
  participantIds: z.array(z.string()).max(50).optional(),
  allOffice: z.boolean().optional(),
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

  // --- 👥 זימון צוות (משרד בלבד): עותק לכל משתתף/ת עם teamKey משותף — כל
  // אחד רואה את זה בבורד וביומן שלו; הודעה מיידית + תזכורת בקבוצת המשרד.
  if (user.role === "ADMIN" && (body.allOffice || (body.participantIds?.length ?? 0) > 1)) {
    const participants = body.allOffice
      ? await prisma.user.findMany({
          where: { role: "ADMIN", active: true },
          select: { id: true, name: true },
        })
      : await prisma.user.findMany({
          where: { id: { in: body.participantIds! }, role: "ADMIN", active: true },
          select: { id: true, name: true },
        });
    if (participants.length === 0) throw new ApiError(400, "לא נבחרו משתתפים מהמשרד");

    const teamKey = crypto.randomUUID();
    const mb = body.reminderMinutesBefore ?? body.reminder?.minutesBefore ?? 60;
    const remindAt = new Date(dueAt.getTime() - mb * 60_000);
    const created: { id: string }[] = [];
    for (const [i, p] of participants.entries()) {
      const t = await prisma.task.create({
        data: {
          clientId,
          title: body.title,
          description: body.description || null,
          type: body.type,
          ownerSide: "agency",
          priority: body.priority ?? "normal",
          orderIndex: 0,
          assigneeId: p.id,
          dueAt,
          durationMin: body.durationMin ?? (body.type === "meeting" ? 60 : null),
          location: body.location || null,
          createdById: user.id,
          teamKey,
          // תזכורת קבוצתית אחת בלבד — על העותק הראשון (הקרון שולח לקבוצה).
          ...(i === 0
            ? { reminders: { create: [{ channel: "whatsapp", target: "office_group", remindAt }] } }
            : {}),
        },
      });
      created.push(t);
      await createTaskEvent({ ...t, createdById: user.id });
    }

    // הודעה מיידית לקבוצת המשרד (אם הוגדרה בהגדרות סוכן המשימות).
    const cfg = await getTaskAgentConfig();
    if (cfg.officeGroupChatId) {
      const label = body.type === "meeting" ? "פגישת צוות" : "משימת צוות";
      await sendWhatsappToChat(
        cfg.officeGroupChatId,
        `📅 ${label}: ${body.title}\n` +
          `מועד: ${formatDateTime(dueAt)}` +
          (body.location ? `\nמיקום: ${body.location}` : "") +
          `\nמשתתפים: ${body.allOffice ? "כל המשרד 🙌" : participants.map((p) => p.name).join(", ")}` +
          `\nזומן ע"י ${user.name}`
      ).catch(() => {});
    }
    return NextResponse.json({ task: created[0], teamCount: created.length }, { status: 201 });
  }

  // תזכורות: ריבוי ערוצים (reminderChannels) × יעדים (סוכן/ליד); אחרת תאימות לאחור.
  const reminderRows: { channel: string; target: string; remindAt: Date }[] = [];
  if (body.reminderChannels && body.reminderChannels.length) {
    const mb = body.reminderMinutesBefore ?? 0;
    const remindAt = new Date(dueAt.getTime() - mb * 60_000);
    const targets = body.reminderTargets && body.reminderTargets.length ? body.reminderTargets : ["agent"];
    for (const target of [...new Set(targets)]) {
      for (const channel of [...new Set(body.reminderChannels)]) {
        reminderRows.push({ channel, target, remindAt });
      }
    }
  } else if (body.reminder) {
    reminderRows.push({
      channel: body.reminder.channel,
      target: "agent",
      remindAt: new Date(dueAt.getTime() - body.reminder.minutesBefore * 60_000),
    });
  }

  // חדש = למעלה בבורד של המטפל (orderIndex קטן מהמינימום הקיים).
  const firstOnBoard = await prisma.task.findFirst({
    where: { assigneeId: body.assigneeId || null, status: { in: ["open", "in_progress"] } },
    orderBy: { orderIndex: "asc" },
    select: { orderIndex: true },
  });

  const task = await prisma.task.create({
    data: {
      clientId,
      title: body.title,
      description: body.description || null,
      type: body.type,
      ownerSide,
      priority: body.priority ?? "normal",
      orderIndex: (firstOnBoard?.orderIndex ?? 1) - 1,
      assigneeId: body.assigneeId || null,
      leadId: body.leadId || null,
      dueAt,
      durationMin: body.durationMin ?? (body.type === "meeting" ? 60 : null),
      location: body.location || null,
      createdById: user.id,
      ...(reminderRows.length ? { reminders: { create: reminderRows } } : {}),
    },
    include: { reminders: true },
  });

  // דו-כיווני: משימות צד-משרד נכתבות ליומן Google של המטפל/היוצר (אם מחובר).
  if (ownerSide === "agency") {
    await createTaskEvent({ ...task, createdById: user.id });
  }

  return NextResponse.json({ task }, { status: 201 });
});
