import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson } from "@/lib/api";
import { getTaskAgentConfig } from "@/lib/taskAgent";
import { aiConfigured } from "@/lib/ai";
import { whatsappConfigured } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// GET /api/task-agent — הגדרות סוכן לכידת המשימות + מצב תלויות (AI/וואטסאפ).
export const GET = handle(async () => {
  await requireAdmin();
  const config = await getTaskAgentConfig();
  return NextResponse.json({ config, aiReady: aiConfigured(), waReady: whatsappConfigured() });
});

const UpdateAgent = z.object({
  enabled: z.boolean().optional(),
  allowedNumbers: z.string().max(2000).optional(),
  instructions: z.string().max(2000).nullable().optional(),
  model: z.string().max(80).nullable().optional(),
  replyConfirm: z.boolean().optional(),
});

// PATCH /api/task-agent — עדכון הגדרות (מנהל בלבד).
export const PATCH = handle(async (req) => {
  await requireAdmin();
  const b = UpdateAgent.parse(await readJson(req));
  const cur = await getTaskAgentConfig();
  const data: Record<string, unknown> = {};
  if (b.enabled !== undefined) data.enabled = b.enabled;
  if (b.allowedNumbers !== undefined) data.allowedNumbers = b.allowedNumbers;
  if (b.instructions !== undefined) data.instructions = b.instructions?.trim() || null;
  if (b.model !== undefined) data.model = b.model?.trim() || null;
  if (b.replyConfirm !== undefined) data.replyConfirm = b.replyConfirm;
  const config = await prisma.aiAgentConfig.update({ where: { id: cur.id }, data });
  return NextResponse.json({ config });
});
