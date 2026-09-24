import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { normalizeBullets, formatSummaryForClient } from "@/lib/meetingSummary";

export const dynamic = "force-dynamic";

// GET /api/meetings/[id]/preview — הטקסט המדויק שהלקוח יקבל (לתצוגה מקדימה
// לפני שליחה). כולל את הנקודות המסומנות ללקוח בלבד, בלי המטלות הפנימיות.
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const m = await prisma.meetingSummary.findUnique({
    where: { id: params.id },
    include: { client: { select: { name: true, contactEmail: true } } },
  });
  if (!m) throw new ApiError(404, "סיכום לא נמצא");
  const bullets = normalizeBullets(JSON.parse(m.bullets || "[]"));
  const text = formatSummaryForClient({ clientName: m.client.name, meetingDate: m.meetingDate, bullets });
  return NextResponse.json({
    text,
    visiblePoints: bullets.filter((b) => b.clientVisible).length,
    hasEmail: Boolean(m.client.contactEmail),
  });
});
