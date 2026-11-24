import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";
import { ilWeekStartUTC, weekRangeLabel } from "@/lib/time";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CATEGORIES = ["collect", "meetings", "office", "campaigns", "shoots", "misc"] as const;

// רשימת השבוע משותפת לכל המשרד — כל מי שיש לו גישה למודול המשימות.
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

// GET /api/weekly-tasks?offset=0 — משימות של שבוע (0=השבוע, 1=הבא, -1=הקודם).
export const GET = handle(async (req) => {
  await guard();
  const offset = Math.trunc(Number(new URL(req.url).searchParams.get("offset")) || 0);
  const weekStart = weekStartForOffset(offset);

  const [tasks, nextWeekCount] = await Promise.all([
    prisma.weeklyTask.findMany({
      where: { weekStart },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      include: INCLUDE,
    }),
    // ספירת "ממתין לשבוע הבא" — רק כשצופים בשבוע הנוכחי.
    offset === 0
      ? prisma.weeklyTask.count({ where: { weekStart: weekStartForOffset(1), done: false } })
      : Promise.resolve(0),
  ]);

  return NextResponse.json({
    weekStart: weekStart.toISOString(),
    label: weekRangeLabel(weekStart),
    offset,
    nextWeekCount,
    tasks,
  });
});

const Create = z.object({
  category: z.enum(CATEGORIES).default("misc"),
  title: z.string().min(1, "חסרה כותרת").max(400),
  note: z.string().max(2000).nullable().optional(),
  clientId: z.string().min(1).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  at: z.string().datetime().nullable().optional(),
  week: z.enum(["this", "next"]).default("this"), // לאיזה שבוע להוסיף
});

// POST /api/weekly-tasks — הוספת שורה לשבוע הנוכחי או הבא.
export const POST = handle(async (req) => {
  const user = await guard();
  const b = Create.parse(await readJson(req));
  const weekStart = weekStartForOffset(b.week === "next" ? 1 : 0);

  const last = await prisma.weeklyTask.findFirst({
    where: { weekStart, category: b.category },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });

  const task = await prisma.weeklyTask.create({
    data: {
      weekStart,
      category: b.category,
      title: b.title.trim(),
      note: b.note?.trim() || null,
      clientId: b.clientId || null,
      projectId: b.projectId || null,
      at: b.at ? new Date(b.at) : null,
      orderIndex: (last?.orderIndex ?? -1) + 1,
      createdById: user.id,
      createdByName: user.name,
    },
    include: INCLUDE,
  });
  return NextResponse.json({ task }, { status: 201 });
});
