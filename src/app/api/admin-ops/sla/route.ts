import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { getTaskAgentConfig } from "@/lib/taskAgent";
import { responseTimeStats } from "@/lib/leadSla";

export const dynamic = "force-dynamic";

// GET /api/admin-ops/sla — הגדרות Speed-to-Lead + מדד זמן תגובה פר משווק.
export const GET = handle(async (req) => {
  await requireManager();
  const days = Number(new URL(req.url).searchParams.get("days")) || 7;
  const cfg = await getTaskAgentConfig();
  const stats = await responseTimeStats(Math.min(90, Math.max(1, days)));
  return NextResponse.json({
    config: {
      slaEnabled: cfg.slaEnabled,
      slaMarketerMinutes: cfg.slaMarketerMinutes,
      slaEscalateMinutes: cfg.slaEscalateMinutes,
      slaWorkStart: cfg.slaWorkStart,
      slaWorkEnd: cfg.slaWorkEnd,
    },
    stats,
    days,
  });
});

const HHMM = z.string().regex(/^\d{1,2}:\d{2}$/, "שעה לא תקינה (HH:MM)");
const Update = z.object({
  slaEnabled: z.boolean().optional(),
  slaMarketerMinutes: z.number().int().min(1).max(1440).optional(),
  slaEscalateMinutes: z.number().int().min(1).max(2880).optional(),
  slaWorkStart: HHMM.optional(),
  slaWorkEnd: HHMM.optional(),
});

// PATCH /api/admin-ops/sla — עדכון הגדרות (מנהל בלבד).
export const PATCH = handle(async (req) => {
  await requireManager();
  const b = Update.parse(await readJson(req));
  const cur = await getTaskAgentConfig();
  await prisma.aiAgentConfig.update({ where: { id: cur.id }, data: b });
  return NextResponse.json({ ok: true });
});
