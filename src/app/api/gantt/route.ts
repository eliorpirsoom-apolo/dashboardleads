import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

function thisMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

// GET /api/gantt?clientId — התוכנית + שורות. נגיש לשני הצדדים (לקוח רואה
// רק את עצמו). נוצר עם עוגן חודש נוכחי אם עדיין לא קיים.
export const GET = handle(async (req) => {
  const user = await requireUser();
  const clientId = scopeClientId(user, new URL(req.url).searchParams.get("clientId"));

  let plan = await prisma.ganttPlan.findUnique({
    where: { clientId },
    include: { tasks: { orderBy: { order: "asc" } } },
  });
  // המשרד יוצר תוכנית ריקה בכניסה ראשונה; הלקוח רק צופה.
  if (!plan && user.role === "ADMIN") {
    plan = await prisma.ganttPlan.create({
      data: { clientId, startMonth: thisMonth() },
      include: { tasks: { orderBy: { order: "asc" } } },
    });
  }
  return NextResponse.json({
    plan: plan
      ? {
          id: plan.id,
          startMonth: plan.startMonth,
          tasks: plan.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            ownerName: t.ownerName,
            color: t.color,
            order: t.order,
            weeks: safeParse(t.weeks),
          })),
        }
      : null,
    canEdit: user.role === "ADMIN",
  });
});

function safeParse(s: string): Record<string, string> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

const UpdatePlan = z.object({
  clientId: z.string().optional(),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

// PATCH /api/gantt — עוגן החודש. משרד בלבד.
export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = UpdatePlan.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);
  if (user.role !== "ADMIN") throw new ApiError(403, "צד משרד בלבד");
  const plan = await prisma.ganttPlan.upsert({
    where: { clientId },
    create: { clientId, startMonth: body.startMonth ?? thisMonth() },
    update: { startMonth: body.startMonth },
  });
  return NextResponse.json({ plan });
});
