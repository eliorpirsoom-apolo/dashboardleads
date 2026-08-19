import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/office-users — רשימה קלה של אנשי המשרד הפעילים (לתיוג @ בעדכונים).
// נגיש לכל משתמש משרד (גם staff) — שמות בלבד, בלי פרטים רגישים.
export const GET = handle(async () => {
  await requireAdmin();
  const users = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ users });
});
