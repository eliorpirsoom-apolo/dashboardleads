import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson } from "@/lib/api";
import { getTaskAgentConfig, extractTasksRaw, isWhitelisted } from "@/lib/taskAgent";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TestBody = z.object({
  text: z.string().min(1).max(2000),
  // אופציונלי: מספר טלפון לבדיקה מול רשימת המורשים.
  phone: z.string().max(30).optional(),
});

// POST /api/task-agent/test — אבחון הסוכן: מריץ את חילוץ המשימות על טקסט נתון
// ומחזיר את התשובה הגולמית של ה-AI + מצב הזרימה הנכנסת (בלי ליצור משימות).
export const POST = handle(async (req) => {
  await requireAdmin();
  const b = TestBody.parse(await readJson(req));
  const cfg = await getTaskAgentConfig();

  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const [extraction, lastInbound, inbound14d, lastWaTask] = await Promise.all([
    extractTasksRaw(b.text, cfg.instructions, cfg.model),
    prisma.whatsappMessage.findFirst({
      where: { direction: "in" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.whatsappMessage.count({ where: { direction: "in", createdAt: { gte: twoWeeksAgo } } }),
    prisma.taskInbox.findFirst({
      where: { source: "whatsapp" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, text: true },
    }),
  ]);

  return NextResponse.json({
    agent: { enabled: cfg.enabled, groupsEnabled: cfg.groupsEnabled, name: cfg.name, model: cfg.model },
    phoneWhitelisted: b.phone ? isWhitelisted(cfg.allowedNumbers, b.phone) : null,
    extraction,
    inbound: { lastInboundAt: lastInbound?.createdAt ?? null, inbound14d },
    lastWaTask,
  });
});
