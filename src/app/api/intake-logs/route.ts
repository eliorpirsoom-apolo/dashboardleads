import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/intake-logs?clientId&status&page — the intake pipeline debugger.
// Agency-side only: shows exactly what came in and what happened to it.
export const GET = handle(async (req) => {
  await requireAdmin();
  const p = new URL(req.url).searchParams;
  const clientId = p.get("clientId");
  const page = Math.max(1, Number(p.get("page") || 1));
  const pageSize = 30;

  const where = {
    ...(clientId ? { clientId } : {}),
    ...(p.get("status") ? { status: p.get("status")! } : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.intakeLog.count({ where }),
    prisma.intakeLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        source: { select: { name: true, kind: true } },
      },
    }),
  ]);

  return NextResponse.json({ logs, total, page, pageSize });
});
