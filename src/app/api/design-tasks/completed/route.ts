import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/design-tasks/completed?q — ארכיון "הושלמו": משימות עיצוב שאושרו,
// עם התוצרים (הקבצים) שלהן. חדש-למעלה (לפי מועד האישור). חיפוש חופשי אופציונלי
// על כותרת/לקוח/מעצב/ת ושמות קבצים. המשימות לא נמחקות לעולם — רק יורדות מהלוח.
export const GET = handle(async (req) => {
  await requireAdmin();
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 80);

  const where: Record<string, unknown> = { status: "approved" };
  if (q) {
    const c = { contains: q, mode: "insensitive" as const };
    where.OR = [
      { title: c },
      { client: { name: c } },
      { designer: { name: c } },
      { assets: { some: { fileName: c } } },
    ];
  }

  const tasks = await prisma.designTask.findMany({
    where,
    orderBy: [{ approvedAt: "desc" }, { updatedAt: "desc" }],
    take: 400,
    include: {
      client: { select: { id: true, name: true, color: true } },
      designer: { select: { id: true, name: true } },
      // תוצרים בלבד (מה שהמעצב/ת מסר/ה) — זה מה שחשוב בארכיון.
      assets: {
        where: { kind: "deliverable" },
        select: { id: true, fileName: true, kind: true, round: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return NextResponse.json({ tasks });
});
