import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/design-tasks/completed?q&clientId — לשונית "הושלמו": משימות עיצוב
// שסיימו את מסלול העבודה — "מאושר לעלות לאוויר" (ready_to_publish, ממתינות
// לעלייה לאוויר) + "אושר/הושלם" (approved). עם התוצרים, חדש-למעלה (לפי מועד
// עדכון אחרון — המשימה האחרונה למעלה), חיפוש וסינון-לקוח. אף משימה לא נמחקת.
export const GET = handle(async (req) => {
  await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") || "").trim().slice(0, 80);
  const clientId = sp.get("clientId") || "";

  const where: Record<string, unknown> = { status: { in: ["ready_to_publish", "approved"] } };
  if (clientId) where.clientId = clientId;
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
    // חדש-למעלה: לפי מועד העדכון האחרון (המשימה האחרונה למעלה, הישנה למטה).
    orderBy: [{ updatedAt: "desc" }],
    take: 500,
    include: {
      client: { select: { id: true, name: true, color: true } },
      designer: { select: { id: true, name: true } },
      assets: {
        where: { kind: "deliverable" },
        select: { id: true, fileName: true, kind: true, round: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return NextResponse.json({ tasks });
});
