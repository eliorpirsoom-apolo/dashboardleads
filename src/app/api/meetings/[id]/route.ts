import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { normalizeBullets } from "@/lib/meetingSummary";

export const dynamic = "force-dynamic";

// GET /api/meetings/[id] — סיכום מלא + פרטי לקוח/פרויקט + שמות יוצרים/אחראים.
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const m = await prisma.meetingSummary.findUnique({
    where: { id: params.id },
    include: { client: { select: { id: true, name: true, color: true, whatsappGroupChatId: true } } },
  });
  if (!m) throw new ApiError(404, "סיכום לא נמצא");
  const bullets = safe(m.bullets);
  const [projects, users, creator, photoUrls] = await Promise.all([
    prisma.project.findMany({
      where: { clientId: m.clientId, status: { not: "archived" } },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    m.createdById
      ? prisma.user.findUnique({ where: { id: m.createdById }, select: { name: true } })
      : Promise.resolve(null),
    Promise.resolve(safeArr(m.photoKeys).map((k) => `/api/meetings/${m.id}/photo?key=${encodeURIComponent(k)}`)),
  ]);
  const project = m.projectId ? projects.find((p) => p.id === m.projectId) ?? null : null;
  return NextResponse.json({
    meeting: {
      id: m.id,
      clientId: m.clientId,
      client: m.client,
      projectId: m.projectId,
      project,
      title: m.title,
      meetingDate: m.meetingDate,
      rawText: m.rawText,
      bullets,
      status: m.status,
      source: m.source,
      createdBy: creator?.name ?? null,
      sentToClientAt: m.sentToClientAt,
      photoUrls,
      hasClientGroup: Boolean(m.client.whatsappGroupChatId),
      createdAt: m.createdAt,
    },
    projects,
    agents: users,
  });
});

function safe(raw: string | null) {
  try {
    return normalizeBullets(JSON.parse(raw || "[]"));
  } catch {
    return [];
  }
}
function safeArr(raw: string | null): string[] {
  try {
    const a = JSON.parse(raw || "[]");
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const UpdateMeeting = z.object({
  title: z.string().max(300).optional(),
  meetingDate: z.string().optional(),
  projectId: z.string().nullable().optional(),
  bullets: z.array(z.any()).optional(),
  status: z.enum(["draft", "approved", "sent"]).optional(),
});

// PATCH /api/meetings/[id] — עריכת כותרת/תאריך/פרויקט/בולטים/סטטוס.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const b = UpdateMeeting.parse(await readJson(req));
  const m = await prisma.meetingSummary.findUnique({ where: { id: params.id } });
  if (!m) throw new ApiError(404, "סיכום לא נמצא");

  const data: Record<string, unknown> = {};
  if (b.title !== undefined) data.title = b.title.trim();
  if (b.meetingDate !== undefined) {
    const d = new Date(b.meetingDate);
    if (!isNaN(d.getTime())) data.meetingDate = d;
  }
  if (b.projectId !== undefined) data.projectId = b.projectId || null;
  if (b.bullets !== undefined) data.bullets = JSON.stringify(normalizeBullets(b.bullets));
  if (b.status !== undefined) data.status = b.status;

  const updated = await prisma.meetingSummary.update({ where: { id: m.id }, data });
  return NextResponse.json({ meeting: { id: updated.id, status: updated.status } });
});

// DELETE /api/meetings/[id] — מחיקת סיכום (מנהל בלבד; המשימות שנגזרו נשארות).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const m = await prisma.meetingSummary.findUnique({ where: { id: params.id } });
  if (!m) throw new ApiError(404, "סיכום לא נמצא");
  await prisma.meetingSummary.delete({ where: { id: m.id } });
  return NextResponse.json({ ok: true, deleted: true });
});
