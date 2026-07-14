import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireAdmin, readJson } from "@/lib/api";
import { syncMetaInsights } from "@/lib/integrations/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SyncReq = z.object({
  clientId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

// POST /api/integrations/meta/sync — pull WhatsApp counts + top ads now.
export const POST = handle(async (req) => {
  await requireAdmin();
  const body = SyncReq.parse(await readJson(req));
  const month = body.month ?? new Date().toISOString().slice(0, 7);
  const result = await syncMetaInsights(body.clientId, month);
  return NextResponse.json({ ok: true, ...result, month });
});
