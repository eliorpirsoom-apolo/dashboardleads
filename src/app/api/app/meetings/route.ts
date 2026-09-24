import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, ApiError } from "@/lib/api";
import { normalizeBullets } from "@/lib/meetingSummary";

export const dynamic = "force-dynamic";

// GET /api/app/meetings — סיכומי הפגישות של הלקוח המחובר (בעל חשבון בלבד).
// מציג רק סיכומים שנשלחו, ורק את הנקודות שסומנו ללקוח (בלי מטלות פנימיות).
export const GET = handle(async () => {
  const user = await requireUser();
  if (user.role !== "CLIENT" || user.isAgent || !user.clientId) {
    throw new ApiError(403, "לבעלי חשבון לקוח בלבד");
  }
  const rows = await prisma.meetingSummary.findMany({
    where: { clientId: user.clientId, status: "sent" },
    orderBy: [{ meetingDate: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: { id: true, title: true, meetingDate: true, bullets: true, sentToClientAt: true },
  });
  const meetings = rows.map((r) => {
    let points: string[] = [];
    try {
      points = normalizeBullets(JSON.parse(r.bullets || "[]"))
        .filter((b) => b.clientVisible)
        .map((b) => b.text);
    } catch {
      points = [];
    }
    return { id: r.id, title: r.title, meetingDate: r.meetingDate, sentAt: r.sentToClientAt, points };
  });
  return NextResponse.json({ meetings });
});
