import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { teamGoogleEvents } from "@/lib/gcal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/gcal/events?from=YYYY-MM-DD&to=YYYY-MM-DD
// כל אירועי יומני Google של הצוות בחלון הזמן + רשימת המחוברים.
export const GET = handle(async (req) => {
  const user = await requireAdmin();
  const p = new URL(req.url).searchParams;
  const from = p.get("from");
  const to = p.get("to");
  if (!from || !to) throw new ApiError(400, "חסר from/to");

  const { events, connections } = await teamGoogleEvents(
    new Date(from).toISOString(),
    new Date(`${to}T23:59:59`).toISOString()
  );

  const me = await prisma.calendarConnection.findUnique({
    where: { userId: user.id },
    select: { googleEmail: true, active: true },
  });

  return NextResponse.json({
    events,
    connections,
    me: me?.active ? { email: me.googleEmail } : null,
  });
});
