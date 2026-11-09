import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { syncDesignTaskCalendar } from "@/lib/studioGcal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

const Body = z.object({
  // תחילת השבוע המגולגל (יום ראשון 00:00 מקומי). המשימות הפתוחות שמתוזמנות
  // בשבוע הזה יזוזו שבוע קדימה (אותו יום+שעה).
  weekStart: z.string().min(1),
  // אופציונלי — לגלגל רק משימות של מעצב/ת מסוים/ת (ברירת מחדל: כל המעצבים).
  designerId: z.string().min(1).nullable().optional(),
});

// POST /api/design-tasks/rollover — "פתיחת שבוע חדש": כל משימת עיצוב שטרם
// אושרה ומתוזמנת בשבוע שנבחר → מוזזת שבוע קדימה (scheduledAt +7, dueAt +7 אם יש),
// מנקה דגל איחור, ומסתנכרנת מחדש ליומן המעצב/ת. מחזיר דו"ח מה זז.
export const POST = handle(async (req) => {
  const user = await requireAdmin();
  const b = Body.parse(await readJson(req));

  const start = new Date(b.weekStart);
  if (isNaN(start.getTime())) throw new ApiError(400, "תאריך תחילת שבוע לא תקין");
  const end = new Date(start.getTime() + WEEK);

  const where: Record<string, unknown> = {
    status: { not: "approved" }, // כל מה שלא הושלם
    scheduledAt: { gte: start, lt: end },
  };
  if (b.designerId) where.designerId = b.designerId;

  const tasks = await prisma.designTask.findMany({
    where,
    select: { id: true, title: true, scheduledAt: true, dueAt: true },
    orderBy: { scheduledAt: "asc" },
    take: 500,
  });

  const moved: { id: string; title: string; from: string; to: string }[] = [];
  for (const t of tasks) {
    if (!t.scheduledAt) continue;
    const newSched = new Date(t.scheduledAt.getTime() + WEEK);
    const newDue = t.dueAt ? new Date(t.dueAt.getTime() + WEEK) : null;
    await prisma.designTask.update({
      where: { id: t.id },
      data: { scheduledAt: newSched, dueAt: newDue, overdue: false },
    });
    // סנכרון מחדש ליומן ה-Google של המעצב/ת (best-effort — לא מפיל את הגלגול).
    await syncDesignTaskCalendar(t.id, user.id).catch((e) => console.error("[studio:rollover:gcal]", e));
    moved.push({
      id: t.id,
      title: t.title,
      from: t.scheduledAt.toISOString(),
      to: newSched.toISOString(),
    });
  }

  return NextResponse.json({ moved: moved.length, tasks: moved });
});
