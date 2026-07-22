import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/engagements?status=active|done|all — "נכנס לעבודה" (צד משרד).
export const GET = handle(async (req) => {
  await requireAdmin();
  const status = new URL(req.url).searchParams.get("status") ?? "active";
  const engagements = await prisma.engagement.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, name: true } },
      tasks: {
        orderBy: { order: "asc" },
        include: { assignee: { select: { id: true, name: true } } },
      },
    },
  });
  return NextResponse.json({ engagements });
});
