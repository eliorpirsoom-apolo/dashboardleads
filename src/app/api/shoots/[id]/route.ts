import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";
import { SHOOT_STATUS_KEYS, SHOOT_TYPE_KEYS } from "@/lib/shoots";

export const dynamic = "force-dynamic";

function assertShootsModule(user: Parameters<typeof canAccessAdminModule>[0]) {
  if (user.role === "ADMIN" && !canAccessAdminModule(user, "shoots")) {
    throw new ApiError(403, "אין לך הרשאה למודול ימי צילום");
  }
}

function parseDate(v: string, field: string): Date {
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new ApiError(400, `תאריך לא תקין (${field})`);
  return d;
}

const CrewItem = z.object({ userId: z.string().min(1), role: z.string().max(40).nullable().optional() });

const Patch = z.object({
  projectId: z.string().min(1).nullable().optional(),
  title: z.string().max(160).nullable().optional(),
  date: z.string().min(1).optional(),
  endAt: z.string().min(1).nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  types: z.array(z.enum(SHOOT_TYPE_KEYS as [string, ...string[]])).optional(),
  status: z.enum(SHOOT_STATUS_KEYS as [string, ...string[]]).optional(),
  equipment: z.string().max(2000).nullable().optional(),
  deliverables: z.string().max(2000).nullable().optional(),
  cost: z.number().min(0).max(100000000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  crew: z.array(CrewItem).optional(),
});

// PATCH /api/shoots/[id] — עדכון יום צילום (כולל סטטוס מהלוח ושיבוץ צוות).
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireAdmin();
  assertShootsModule(user);
  const shoot = await prisma.shootDay.findUnique({ where: { id: params.id } });
  if (!shoot) throw new ApiError(404, "יום צילום לא נמצא");
  const b = Patch.parse(await readJson(req));
  const isManager = user.adminRole !== "staff";

  if (b.projectId) {
    const project = await prisma.project.findUnique({ where: { id: b.projectId } });
    if (!project || project.clientId !== shoot.clientId) throw new ApiError(400, "פרויקט לא תקין");
  }

  const data: Record<string, unknown> = {};
  if ("projectId" in b) data.projectId = b.projectId ?? null;
  if ("title" in b) data.title = b.title || null;
  if (b.date) data.date = parseDate(b.date, "date");
  if ("endAt" in b) data.endAt = b.endAt ? parseDate(b.endAt, "endAt") : null;
  if ("location" in b) data.location = b.location || null;
  if (b.types) data.types = JSON.stringify(b.types);
  if (b.status) data.status = b.status;
  if ("equipment" in b) data.equipment = b.equipment || null;
  if ("deliverables" in b) data.deliverables = b.deliverables || null;
  if ("notes" in b) data.notes = b.notes || null;
  if ("cost" in b && isManager) data.cost = b.cost ?? null; // עלות — מנהל בלבד

  await prisma.$transaction(async (tx) => {
    await tx.shootDay.update({ where: { id: shoot.id }, data });
    // שיבוץ צוות — החלפה מלאה כשנשלח (userId ייחודי, כדי לא להפר @@unique).
    if (b.crew) {
      await tx.shootCrew.deleteMany({ where: { shootId: shoot.id } });
      const seen = new Set<string>();
      const rows = b.crew
        .filter((c) => (seen.has(c.userId) ? false : (seen.add(c.userId), true)))
        .map((c) => ({ shootId: shoot.id, userId: c.userId, role: c.role || null }));
      if (rows.length) await tx.shootCrew.createMany({ data: rows });
    }
  });

  const full = await prisma.shootDay.findUnique({
    where: { id: shoot.id },
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      crew: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  return NextResponse.json({ ok: true, shoot: full });
});

// DELETE /api/shoots/[id] — מחיקת יום צילום (הצוות נמחק ב-cascade).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireAdmin();
  assertShootsModule(user);
  const shoot = await prisma.shootDay.findUnique({ where: { id: params.id } });
  if (!shoot) throw new ApiError(404, "יום צילום לא נמצא");
  await prisma.shootDay.delete({ where: { id: shoot.id } });
  return NextResponse.json({ ok: true, deleted: true });
});
