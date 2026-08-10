import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { getTaskAgentConfig } from "@/lib/taskAgent";

export const dynamic = "force-dynamic";

// GET /api/admin-ops/digest — מצב תקציר הבוקר היומי (מנהל בלבד).
export const GET = handle(async () => {
  await requireManager();
  const cfg = await getTaskAgentConfig();
  return NextResponse.json({ enabled: cfg.morningDigestEnabled });
});

const Update = z.object({ enabled: z.boolean() });

// PATCH /api/admin-ops/digest — הפעלה/כיבוי של תקציר הבוקר (מנהל בלבד).
export const PATCH = handle(async (req) => {
  await requireManager();
  const b = Update.parse(await readJson(req));
  const cur = await getTaskAgentConfig();
  await prisma.aiAgentConfig.update({ where: { id: cur.id }, data: { morningDigestEnabled: b.enabled } });
  return NextResponse.json({ ok: true, enabled: b.enabled });
});
