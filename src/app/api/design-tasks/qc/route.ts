import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/design-tasks/qc?q&clientId — לשונית "בקרת איכות": משימות שהמעצב/ת
// סימן/ה כמוכנות ונכנסו ל-qc. למאשר/ת יש 2 פעולות (בצד הלקוח): החזרה לתיקונים
// או אישור לעלייה לאוויר. כאן מחזירים את המשימות עם התוצרים לצפייה.
export const GET = handle(async (req) => {
  await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") || "").trim().slice(0, 80);
  const clientId = sp.get("clientId") || "";

  const where: Record<string, unknown> = { status: "qc" };
  if (clientId) where.clientId = clientId;
  if (q) {
    const c = { contains: q, mode: "insensitive" as const };
    where.OR = [{ title: c }, { client: { name: c } }, { designer: { name: c } }];
  }

  const tasks = await prisma.designTask.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 300,
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
