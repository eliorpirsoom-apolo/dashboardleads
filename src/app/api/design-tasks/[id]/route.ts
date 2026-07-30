import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { DESIGN_STATUSES, briefTypeLabel } from "@/lib/studio";
import { createTaskEvent, deleteTaskEvent, syncTaskEvent } from "@/lib/gcal";
import { sendMessage } from "@/lib/messaging";
import { formatDateTime } from "@/lib/format";
import { parseMsgConfig, effectiveFlags } from "@/lib/messagingConfig";

const APP_URL = process.env.APP_BASE_URL || "https://dashboard-leads-apollo13.vercel.app";

// התראה ללקוח שיש עיצוב הממתין לאישור (מייל תמיד; וואטסאפ אם הופעל אצל הלקוח).
async function notifyClientForApproval(task: any): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: task.clientId },
    select: { messagingConfig: true, users: { where: { active: true }, select: { email: true, phone: true } } },
  });
  if (!client) return;
  const eff = effectiveFlags(parseMsgConfig(client.messagingConfig));
  const body =
    `יש עיצוב חדש הממתין לאישורך: "${task.title}".\n` +
    `לצפייה ולמתן אישור/הערות: ${APP_URL}/app/studio`;
  for (const u of client.users) {
    if (u.email) {
      await sendMessage({
        channel: "email",
        to: u.email,
        subject: "🎨 עיצוב ממתין לאישורך",
        body,
        kind: "automation",
        clientId: task.clientId,
      }).catch(() => {});
    }
    if (eff.whatsapp && u.phone) {
      await sendMessage({ channel: "whatsapp", to: u.phone, body, kind: "automation", clientId: task.clientId }).catch(() => {});
    }
  }
}

export const dynamic = "force-dynamic";

// פעולה: תזמון המשימה ביומן של המעצב/ת (Task מקושר → מופיע בלו"ז ומסתנכרן ל-Google),
// + התראה למעצב/ת. אידמפוטנטי לפי calendarTaskId.
async function scheduleInDesignerCalendar(task: any, actorId: string): Promise<void> {
  if (!task.designerId || !task.scheduledAt) return;
  const title = `🎨 עיצוב — ${task.title}`;
  if (task.calendarTaskId) {
    const existing = await prisma.task.findUnique({ where: { id: task.calendarTaskId } });
    if (!existing) return;
    const designerChanged =
      !!existing.googleEventOwnerId && existing.googleEventOwnerId !== task.designerId;
    await prisma.task
      .update({
        where: { id: task.calendarTaskId },
        data: { assigneeId: task.designerId, dueAt: task.scheduledAt, title },
      })
      .catch(() => {});
    if (designerChanged) {
      // הוחלף/ה מעצב/ת — מוחקים את האירוע מיומן ה-Google הישן ויוצרים מחדש אצל החדש/ה.
      await deleteTaskEvent(existing).catch(() => {});
      await prisma.task
        .update({ where: { id: task.calendarTaskId }, data: { googleEventId: null, googleEventOwnerId: null } })
        .catch(() => {});
      const fresh = await prisma.task.findUnique({ where: { id: task.calendarTaskId } });
      if (fresh) await createTaskEvent({ ...fresh, createdById: actorId }).catch(() => {});
    } else {
      // אותה/ו מעצב/ת — דחיפת עדכון המועד/כותרת לאירוע הקיים ב-Google.
      await syncTaskEvent(task.calendarTaskId).catch(() => {});
    }
    return;
  }
  const calTask = await prisma.task.create({
    data: {
      clientId: task.clientId,
      title,
      description: task.brief || null,
      type: "task",
      ownerSide: "agency",
      assigneeId: task.designerId,
      dueAt: task.scheduledAt,
      createdById: actorId,
    },
  });
  await prisma.designTask.update({
    where: { id: task.id },
    data: { calendarTaskId: calTask.id },
  });
  await createTaskEvent({ ...calTask, createdById: actorId }).catch(() => {});

  // התראה למעצב/ת ששובצה משימה.
  const designer = await prisma.user.findUnique({ where: { id: task.designerId } });
  if (designer?.email) {
    await sendMessage({
      channel: "email",
      to: designer.email,
      subject: "🎨 משימת עיצוב תוזמנה לך",
      body:
        `שובצה לך משימת עיצוב: ${task.title} (${briefTypeLabel(task.briefType)})\n` +
        `מועד: ${formatDateTime(task.scheduledAt)}` +
        (task.brief ? `\n\nבריף:\n${task.brief}` : ""),
      kind: "reminder",
      clientId: task.clientId,
    }).catch(() => {});
  }
}

// GET /api/design-tasks/[id] — כרטיס משימת עיצוב מלא.
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const task = await prisma.designTask.findUnique({
    where: { id: params.id },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          color: true,
          contactPhone: true,
          users: {
            where: { active: true, phone: { not: null } },
            select: { phone: true },
            take: 1,
          },
        },
      },
      project: { select: { id: true, name: true } },
      designer: { select: { id: true, name: true } },
      qcBy: { select: { id: true, name: true } },
      assets: { orderBy: { createdAt: "desc" } },
      feedback: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!task) throw new ApiError(404, "משימת עיצוב לא נמצאה");
  // טלפון ליצירת קשר עם הלקוח (איש קשר, או המשתמש הפעיל הראשון) — לכפתור וואטסאפ.
  const clientPhone = task.client?.contactPhone || task.client?.users?.[0]?.phone || null;
  return NextResponse.json({ task: { ...task, clientPhone } });
});

const UpdateDesignTask = z.object({
  title: z.string().min(1).max(200).optional(),
  briefType: z.enum(["landing", "logo", "post", "banner", "print", "branding"]).optional(),
  brief: z.string().max(5000).nullable().optional(),
  specs: z.string().max(1000).nullable().optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  designerId: z.string().nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
  status: z.enum(DESIGN_STATUSES).optional(),
  round: z.number().int().min(1).max(50).optional(),
  overdue: z.boolean().optional(),
});

// PATCH /api/design-tasks/[id] — עדכון שדות + מעברי סטטוס.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireAdmin();
  const b = UpdateDesignTask.parse(await readJson(req));
  const cur = await prisma.designTask.findUnique({ where: { id: params.id } });
  if (!cur) throw new ApiError(404, "משימת עיצוב לא נמצאה");

  // אישור סופי (QC) — מנהל בלבד.
  if (b.status === "approved" && user.adminRole === "staff") {
    throw new ApiError(403, "אישור סופי מותר למנהל המשרד בלבד");
  }

  const data: Record<string, unknown> = {};
  if (b.title !== undefined) data.title = b.title;
  if (b.briefType !== undefined) data.briefType = b.briefType;
  if (b.brief !== undefined) data.brief = b.brief || null;
  if (b.specs !== undefined) data.specs = b.specs || null;
  if (b.priority !== undefined) data.priority = b.priority;
  if (b.designerId !== undefined) data.designerId = b.designerId || null;
  if (b.scheduledAt !== undefined) {
    data.scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : null;
    data.overdue = false; // תזמון מחדש מנקה את דגל האיחור
  }
  if (b.dueAt !== undefined) data.dueAt = b.dueAt ? new Date(b.dueAt) : null;
  if (b.round !== undefined) data.round = b.round;
  if (b.overdue !== undefined) data.overdue = b.overdue;

  if (b.status !== undefined && b.status !== cur.status) {
    data.status = b.status;
    if (b.status === "sent_to_client") {
      data.clientNotifiedAt = new Date();
      data.remindersSent = 0;
    }
    if (b.status === "approved") {
      data.approvedAt = new Date();
      data.qcById = user.id;
      data.qcAt = new Date();
      data.overdue = false;
    }
    if (b.status === "qc") {
      data.qcById = user.id;
    }
  }

  const task = await prisma.designTask.update({ where: { id: params.id }, data });

  // פעולת סטטוס: כשיש מעצב/ת + מועד → אירוע ביומן ה-Google שלו/ה + התראה.
  // נוצר בתזמון הראשון, וממשיך להסתנכרן כל עוד קיימת משימת יומן מקושרת (שינוי מועד/מעצב).
  if (task.designerId && task.scheduledAt && (task.status === "scheduled" || task.calendarTaskId)) {
    await scheduleInDesignerCalendar(task, user.id).catch((e) =>
      console.error("[studio:schedule]", e)
    );
  }
  // פעולת סטטוס: נשלח ללקוח לאישור → התראה ללקוח.
  if (b.status === "sent_to_client" && cur.status !== "sent_to_client") {
    await notifyClientForApproval(task).catch((e) => console.error("[studio:notify]", e));
  }

  return NextResponse.json({ task });
});

// DELETE /api/design-tasks/[id] — מחיקת משימת עיצוב (וכל הנכסים/פידבק בקסקייד).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const cur = await prisma.designTask.findUnique({ where: { id: params.id } });
  if (!cur) throw new ApiError(404, "משימת עיצוב לא נמצאה");
  // ניקוי ה-Task המקושר ביומן של המעצב/ת (+ אירוע Google) כדי לא להשאיר יתומים.
  if (cur.calendarTaskId) {
    const calTask = await prisma.task.findUnique({ where: { id: cur.calendarTaskId } });
    if (calTask) {
      await prisma.task.delete({ where: { id: calTask.id } }).catch(() => {});
      await deleteTaskEvent(calTask).catch(() => {});
    }
  }
  await prisma.designTask.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
