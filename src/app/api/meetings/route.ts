import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { buildMeetingTitle, normalizeBullets } from "@/lib/meetingSummary";

export const dynamic = "force-dynamic";

// GET /api/meetings?clientId&status — רשימת סיכומי פגישות (צד משרד).
export const GET = handle(async (req) => {
  await requireAdmin();
  const p = new URL(req.url).searchParams;
  const where: Record<string, unknown> = {};
  if (p.get("clientId")) where.clientId = p.get("clientId");
  if (p.get("status")) where.status = p.get("status");

  const rows = await prisma.meetingSummary.findMany({
    where,
    orderBy: [{ meetingDate: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: { client: { select: { id: true, name: true, color: true } } },
  });
  // מונה נקודות/משימות לכל סיכום (לתצוגת הרשימה).
  const list = rows.map((r) => {
    const bullets = safeBullets(r.bullets);
    return {
      id: r.id,
      clientId: r.clientId,
      client: r.client,
      projectId: r.projectId,
      title: r.title,
      meetingDate: r.meetingDate,
      status: r.status,
      source: r.source,
      sentToClientAt: r.sentToClientAt,
      createdAt: r.createdAt,
      pointCount: bullets.length,
      taskCount: bullets.filter((b) => b.isTask).length,
    };
  });
  return NextResponse.json({ meetings: list });
});

function safeBullets(raw: string | null) {
  try {
    return normalizeBullets(JSON.parse(raw || "[]"));
  } catch {
    return [];
  }
}

const CreateMeeting = z.object({
  clientId: z.string().min(1, "חסר לקוח"),
  projectId: z.string().nullable().optional(),
  title: z.string().max(300).optional(),
  meetingDate: z.string().optional(),
  bullets: z.array(z.any()).optional(),
  rawText: z.string().max(20000).nullable().optional(),
  photoKeys: z.array(z.string()).optional(),
  source: z.enum(["manual", "whatsapp"]).default("manual"),
});

// POST /api/meetings — יצירת סיכום פגישה (ידני או מהבוט).
export const POST = handle(async (req) => {
  const user = await requireAdmin();
  const b = CreateMeeting.parse(await readJson(req));
  const client = await prisma.client.findUnique({ where: { id: b.clientId } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");

  const meetingDate = b.meetingDate ? new Date(b.meetingDate) : new Date();
  const date = isNaN(meetingDate.getTime()) ? new Date() : meetingDate;
  const bullets = normalizeBullets(b.bullets ?? []);

  const meeting = await prisma.meetingSummary.create({
    data: {
      clientId: client.id,
      projectId: b.projectId || null,
      title: b.title?.trim() || buildMeetingTitle(client.name, date),
      meetingDate: date,
      rawText: b.rawText || null,
      bullets: JSON.stringify(bullets),
      photoKeys: b.photoKeys?.length ? JSON.stringify(b.photoKeys) : null,
      status: "draft",
      source: b.source,
      createdById: user.id,
    },
  });
  return NextResponse.json({ meeting }, { status: 201 });
});
