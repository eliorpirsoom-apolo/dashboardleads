import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";
import { SHOOT_STATUS_KEYS, SHOOT_TYPE_KEYS } from "@/lib/shoots";
import { createShootEvent } from "@/lib/shootsGcal";

export const dynamic = "force-dynamic";

// עובד-משרד שהוגבל ממודול "ימי צילום" נחסם גם ב-API.
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

// עיצוב שורת יום צילום לתשובה — types כמערך, עלות מוסתרת מעובד.
function shape(s: any, isManager: boolean) {
  let types: string[] = [];
  try {
    const p = JSON.parse(s.types);
    if (Array.isArray(p)) types = p.map(String);
  } catch {
    /* ignore */
  }
  return {
    id: s.id,
    clientId: s.clientId,
    client: s.client,
    projectId: s.projectId,
    project: s.project,
    title: s.title,
    date: s.date,
    endAt: s.endAt,
    location: s.location,
    types,
    status: s.status,
    equipment: s.equipment,
    deliverables: s.deliverables,
    cost: isManager ? s.cost : null,
    notes: s.notes,
    crew: (s.crew ?? []).map((c: any) => ({ userId: c.userId, name: c.user?.name ?? "", role: c.role })),
    createdAt: s.createdAt,
  };
}

// GET /api/shoots?clientId&from&to&status — רשימת ימי צילום (חדש-למעלה).
export const GET = handle(async (req) => {
  const user = await requireAdmin();
  assertShootsModule(user);
  const p = new URL(req.url).searchParams;
  const where: Record<string, unknown> = {};
  if (p.get("clientId")) where.clientId = p.get("clientId");
  if (p.get("status")) where.status = p.get("status");
  const from = p.get("from");
  const to = p.get("to");
  if (from || to) {
    where.date = { ...(from ? { gte: parseDate(from, "from") } : {}), ...(to ? { lte: parseDate(to, "to") } : {}) };
  }
  const shoots = await prisma.shootDay.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      crew: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  const isManager = user.adminRole !== "staff";
  return NextResponse.json({ shoots: shoots.map((s) => shape(s, isManager)) });
});

const CrewItem = z.object({ userId: z.string().min(1), role: z.string().max(40).nullable().optional() });

const Create = z.object({
  clientId: z.string().min(1),
  projectId: z.string().min(1).nullable().optional(),
  title: z.string().max(160).nullable().optional(),
  date: z.string().min(1),
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

// POST /api/shoots — יצירת יום צילום.
export const POST = handle(async (req) => {
  const user = await requireAdmin();
  assertShootsModule(user);
  const b = Create.parse(await readJson(req));

  const client = await prisma.client.findUnique({ where: { id: b.clientId } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");
  if (b.projectId) {
    const project = await prisma.project.findUnique({ where: { id: b.projectId } });
    if (!project || project.clientId !== b.clientId) throw new ApiError(400, "פרויקט לא תקין");
  }
  const isManager = user.adminRole !== "staff";

  // צוות ייחודי (כדי לא להפר @@unique[shootId,userId]).
  const seen = new Set<string>();
  const crewRows = (b.crew ?? [])
    .filter((c) => (seen.has(c.userId) ? false : (seen.add(c.userId), true)))
    .map((c) => ({ userId: c.userId, role: c.role || null }));

  const shoot = await prisma.shootDay.create({
    data: {
      clientId: b.clientId,
      projectId: b.projectId ?? null,
      title: b.title || null,
      date: parseDate(b.date, "date"),
      endAt: b.endAt ? parseDate(b.endAt, "endAt") : null,
      location: b.location || null,
      types: JSON.stringify(b.types ?? []),
      status: b.status ?? "pending",
      equipment: b.equipment || null,
      deliverables: b.deliverables || null,
      cost: isManager ? b.cost ?? null : null, // עלות — מנהל בלבד
      notes: b.notes || null,
      createdById: user.id,
      crew: crewRows.length ? { create: crewRows } : undefined,
    },
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      crew: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  await createShootEvent(shoot.id).catch(() => {}); // סנכרון Google Calendar (best-effort)
  return NextResponse.json({ shoot: shape(shoot, isManager) }, { status: 201 });
});
