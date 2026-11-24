import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";
import { ilWeekStartUTC } from "@/lib/time";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CATEGORIES = ["collect", "meetings", "office", "campaigns", "shoots", "misc"] as const;

async function guard() {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "tasks")) throw new ApiError(403, "אין הרשאה למודול המשימות");
  return user;
}

const weekStartForOffset = (offset: number) =>
  new Date(ilWeekStartUTC().getTime() + offset * WEEK_MS);

const INCLUDE = {
  client: { select: { id: true, name: true, color: true } },
  project: { select: { id: true, name: true } },
} as const;

const Patch = z.object({
  done: z.boolean().optional(),
  title: z.string().min(1).max(400).optional(),
  note: z.string().max(2000).nullable().optional(),
  category: z.enum(CATEGORIES).optional(),
  clientId: z.string().min(1).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  at: z.string().datetime().nullable().optional(),
  orderIndex: z.number().int().optional(),
  moveWeek: z.enum(["this", "next"]).optional(), // העברה לשבוע הנוכחי/הבא
});

// PATCH /api/weekly-tasks/:id — סימון בוצע, עריכה, העברת קטגוריה/שבוע.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await guard();
  const b = Patch.parse(await readJson(req));

  const data: Record<string, unknown> = {};
  if (b.title !== undefined) data.title = b.title.trim();
  if (b.note !== undefined) data.note = b.note?.trim() || null;
  if (b.category !== undefined) data.category = b.category;
  if (b.clientId !== undefined) data.clientId = b.clientId || null;
  if (b.projectId !== undefined) data.projectId = b.projectId || null;
  if (b.at !== undefined) data.at = b.at ? new Date(b.at) : null;
  if (b.orderIndex !== undefined) data.orderIndex = b.orderIndex;
  if (b.done !== undefined) {
    data.done = b.done;
    data.doneAt = b.done ? new Date() : null;
  }
  if (b.moveWeek !== undefined) data.weekStart = weekStartForOffset(b.moveWeek === "next" ? 1 : 0);

  const task = await prisma.weeklyTask
    .update({ where: { id: params.id }, data, include: INCLUDE })
    .catch(() => {
      throw new ApiError(404, "המשימה לא נמצאה");
    });

  return NextResponse.json({ task });
});

// DELETE /api/weekly-tasks/:id
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await guard();
  await prisma.weeklyTask.delete({ where: { id: params.id } }).catch(() => {
    throw new ApiError(404, "המשימה לא נמצאה");
  });
  return NextResponse.json({ ok: true });
});
