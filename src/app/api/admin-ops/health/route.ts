import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { runHealthCheck } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/admin-ops/health — מצב הבריאות למנהל: ריצה אחרונה + תקלות פתוחות
// + היסטוריה + דופק קרונים.
export const GET = handle(async () => {
  await requireManager();
  const [lastRun, runs, openIssues, heartbeats] = await Promise.all([
    prisma.healthRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.healthRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 14,
      select: { id: true, startedAt: true, ok: true, warn: true, fail: true },
    }),
    prisma.healthIssue.findMany({
      where: { resolvedAt: null },
      orderBy: { openedAt: "desc" },
    }),
    prisma.cronHeartbeat.findMany(),
  ]);
  return NextResponse.json({
    lastRun: lastRun
      ? { ...lastRun, results: lastRun.results ? JSON.parse(lastRun.results) : [] }
      : null,
    runs,
    openIssues,
    heartbeats,
  });
});

// POST — הרצת בדיקה מלאה עכשיו (מנהל בלבד).
export const POST = handle(async () => {
  await requireManager();
  const result = await runHealthCheck();
  return NextResponse.json(result);
});
