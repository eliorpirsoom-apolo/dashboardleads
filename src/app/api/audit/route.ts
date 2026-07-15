import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { requireManager } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/audit?page — sensitive-actions log. Agency managers only.
export const GET = handle(async (req) => {
  await requireManager();
  const p = new URL(req.url).searchParams;
  const page = Math.max(1, Number(p.get("page") || 1));
  const pageSize = 30;

  const [total, entries] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({ entries, total, page, pageSize });
});
