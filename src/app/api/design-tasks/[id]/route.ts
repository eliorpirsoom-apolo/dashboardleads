import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { DESIGN_STATUSES } from "@/lib/studio";

export const dynamic = "force-dynamic";

// GET /api/design-tasks/[id] — כרטיס משימת עיצוב מלא.
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const task = await prisma.designTask.findUnique({
    where: { id: params.id },
    include: {
      client: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, name: true } },
      designer: { select: { id: true, name: true } },
      qcBy: { select: { id: true, name: true } },
      assets: { orderBy: { createdAt: "desc" } },
      feedback: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!task) throw new ApiError(404, "משימת עיצוב לא נמצאה");
  return NextResponse.json({ task });
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
  return NextResponse.json({ task });
});

// DELETE /api/design-tasks/[id] — מחיקת משימת עיצוב (וכל הנכסים/פידבק בקסקייד).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const cur = await prisma.designTask.findUnique({ where: { id: params.id } });
  if (!cur) throw new ApiError(404, "משימת עיצוב לא נמצאה");
  await prisma.designTask.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
