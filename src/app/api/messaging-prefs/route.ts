import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, readJson, ApiError } from "@/lib/api";
import {
  parseMsgConfig,
  serializeMsgConfig,
  MSG_KEYS,
  type MsgFlags,
} from "@/lib/messagingConfig";

export const dynamic = "force-dynamic";

// GET — הגדרות הדיוור של הלקוח המחובר (allowed + enabled).
export const GET = handle(async () => {
  const user = await requireUser();
  if (user.role === "ADMIN" || !user.clientId) throw new ApiError(400, "צד לקוח בלבד");
  const c = await prisma.client.findUnique({
    where: { id: user.clientId },
    select: { messagingConfig: true },
  });
  const cfg = parseMsgConfig(c?.messagingConfig);
  return NextResponse.json({ allowed: cfg.allowed, enabled: cfg.enabled });
});

const Prefs = z.object({
  enabled: z
    .object({
      broadcast: z.boolean(),
      leadAlerts: z.boolean(),
      email: z.boolean(),
      sms: z.boolean(),
      whatsapp: z.boolean(),
    })
    .partial(),
});

// POST — הלקוח מדליק/מכבה, מוגבל למה שהמשרד התיר. בעל חשבון בלבד (לא סוכן).
export const POST = handle(async (req) => {
  const user = await requireUser();
  if (user.role === "ADMIN" || !user.clientId) throw new ApiError(403, "צד לקוח בלבד");
  if ((user as any).isAgent) throw new ApiError(403, "רק בעל החשבון יכול לשנות הגדרות דיוור");

  const body = Prefs.parse(await readJson(req));
  const c = await prisma.client.findUnique({
    where: { id: user.clientId },
    select: { messagingConfig: true },
  });
  const cfg = parseMsgConfig(c?.messagingConfig);
  const next: MsgFlags = { ...cfg.enabled };
  for (const k of MSG_KEYS) {
    if (k in body.enabled) next[k] = Boolean((body.enabled as any)[k]) && cfg.allowed[k];
  }
  cfg.enabled = next;
  await prisma.client.update({
    where: { id: user.clientId },
    data: { messagingConfig: serializeMsgConfig(cfg) },
  });
  return NextResponse.json({ allowed: cfg.allowed, enabled: cfg.enabled });
});
