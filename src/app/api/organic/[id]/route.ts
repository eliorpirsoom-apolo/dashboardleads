import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";

export const dynamic = "force-dynamic";

async function guard() {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "organic")) throw new ApiError(403, "אין הרשאה למודול קידום אורגני");
  return user;
}

const UpdateAction = z.object({
  kind: z.enum(["link", "content", "onsite", "update", "other"]).optional(),
  title: z.string().min(1).max(300).optional(),
  url: z.string().max(500).nullable().optional(),
  targetPage: z.string().max(500).nullable().optional(),
  anchor: z.string().max(200).nullable().optional(),
  cost: z.number().min(0).max(1000000).nullable().optional(),
  status: z.enum(["planned", "in_progress", "done"]).optional(),
  assigneeId: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

// PATCH /api/organic/[id] — עדכון פעולה. עלות — מנהלים בלבד.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await guard();
  const b = UpdateAction.parse(await readJson(req));
  if (b.cost !== undefined && user.adminRole === "staff") throw new ApiError(403, "עלויות — הנהלה בלבד");
  const data: Record<string, unknown> = { ...b };
  if (b.title !== undefined) data.title = b.title.trim();
  if (b.status !== undefined) {
    data.doneAt = b.status === "done" ? new Date() : null;
  }
  const action = await prisma.seoAction.update({ where: { id: params.id }, data }).catch(() => {
    throw new ApiError(404, "פעולה לא נמצאה");
  });
  return NextResponse.json({ action });
});

// DELETE /api/organic/[id] — מחיקת פעולה.
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await guard();
  await prisma.seoAction.delete({ where: { id: params.id } }).catch(() => {
    throw new ApiError(404, "פעולה לא נמצאה");
  });
  return NextResponse.json({ ok: true });
});
