import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { getTaskAgentConfig } from "@/lib/taskAgent";
import { whatsappConfigured, listWhatsappGroups } from "@/lib/whatsapp";
import { runWhatsappBroadcast } from "@/lib/whatsappBroadcast";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseExcluded(json: string | null): string[] {
  try {
    const a = json ? JSON.parse(json) : [];
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}

// GET /api/admin-ops/broadcast — הגדרות הבוט + רשימת הקבוצות (עם דגל "כלולה").
export const GET = handle(async () => {
  await requireManager();
  const cfg = await getTaskAgentConfig();
  const waReady = whatsappConfigured();
  const excluded = new Set(parseExcluded(cfg.broadcastExcludeGroups));
  let groups: { id: string; name: string; included: boolean }[] = [];
  if (waReady) {
    try {
      const raw = await listWhatsappGroups();
      groups = raw.map((g) => ({ id: g.id, name: g.name, included: !excluded.has(g.id) }));
    } catch {
      groups = [];
    }
  }
  return NextResponse.json({
    waReady,
    config: {
      broadcastEnabled: cfg.broadcastEnabled,
      morningTime: cfg.morningTime,
      morningText: cfg.morningText,
      eodTime: cfg.eodTime,
      eodText: cfg.eodText,
      broadcastDays: cfg.broadcastDays,
      lastMorningSentOn: cfg.lastMorningSentOn,
      lastEodSentOn: cfg.lastEodSentOn,
    },
    groups,
  });
});

const HHMM = z.string().regex(/^\d{1,2}:\d{2}$/, "שעה לא תקינה (HH:MM)");
const Update = z.object({
  broadcastEnabled: z.boolean().optional(),
  morningTime: HHMM.optional(),
  morningText: z.string().max(1000).optional(),
  eodTime: HHMM.optional(),
  eodText: z.string().max(1000).optional(),
  broadcastDays: z.string().max(20).optional(), // "0,1,2,3,4"
  excludeGroups: z.array(z.string()).max(500).optional(), // chatIds שהוחרגו
});

// PATCH /api/admin-ops/broadcast — עדכון הגדרות הבוט (מנהל בלבד).
export const PATCH = handle(async (req) => {
  await requireManager();
  const b = Update.parse(await readJson(req));
  const cur = await getTaskAgentConfig();
  const data: Record<string, unknown> = {};
  if (b.broadcastEnabled !== undefined) data.broadcastEnabled = b.broadcastEnabled;
  if (b.morningTime !== undefined) data.morningTime = b.morningTime;
  if (b.morningText !== undefined) data.morningText = b.morningText;
  if (b.eodTime !== undefined) data.eodTime = b.eodTime;
  if (b.eodText !== undefined) data.eodText = b.eodText;
  if (b.broadcastDays !== undefined) data.broadcastDays = b.broadcastDays;
  if (b.excludeGroups !== undefined) data.broadcastExcludeGroups = JSON.stringify(b.excludeGroups);
  await prisma.aiAgentConfig.update({ where: { id: cur.id }, data });
  return NextResponse.json({ ok: true });
});

// POST /api/admin-ops/broadcast — שליחת בדיקה מיידית לכל הקבוצות הכלולות (מנהל בלבד).
export const POST = handle(async () => {
  await requireManager();
  if (!whatsappConfigured()) return NextResponse.json({ ok: false, error: "וואטסאפ אינו מוגדר" }, { status: 400 });
  const result = await runWhatsappBroadcast(true); // force — מתעלם מהזמן/יום
  return NextResponse.json({ ok: true, result });
});
