import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, ApiError, readJson } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { requireSocialAccess } from "@/lib/social/access";

export const dynamic = "force-dynamic";

const EMPTY = { about: "", faq: "", pricing: "", tone: "", doNotAnswer: "", escalate: "", aiEnabled: true };

// GET /api/social/knowledge?clientId= — מאגר הידע של הלקוח להנחיית ה-AI
// (צוות עם הרשאת "תיבת מענה"; אין כאן סודות).
export const GET = handle(async (req) => {
  await requireSocialAccess();
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) throw new ApiError(400, "חסר clientId");
  const k = await prisma.socialKnowledge.findUnique({ where: { clientId } });
  return NextResponse.json({
    knowledge: k
      ? {
          about: k.about ?? "",
          faq: k.faq ?? "",
          pricing: k.pricing ?? "",
          tone: k.tone ?? "",
          doNotAnswer: k.doNotAnswer ?? "",
          escalate: k.escalate ?? "",
          aiEnabled: k.aiEnabled,
          updatedAt: k.updatedAt,
        }
      : { ...EMPTY, updatedAt: null },
    exists: Boolean(k),
  });
});

const Body = z.object({
  clientId: z.string().min(1),
  about: z.string().max(6000).optional(),
  faq: z.string().max(12000).optional(),
  pricing: z.string().max(6000).optional(),
  tone: z.string().max(2000).optional(),
  doNotAnswer: z.string().max(4000).optional(),
  escalate: z.string().max(2000).optional(),
  aiEnabled: z.boolean().optional(),
});

// PUT /api/social/knowledge — שמירה (מנהל בלבד: "אסור לענות" ומחירים הם מדיניות).
export const PUT = handle(async (req) => {
  await requireManager();
  const b = Body.parse(await readJson(req));
  const client = await prisma.client.findUnique({ where: { id: b.clientId }, select: { id: true } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");
  const clean = (s?: string) => (s === undefined ? undefined : s.trim() || null);
  const data = {
    about: clean(b.about),
    faq: clean(b.faq),
    pricing: clean(b.pricing),
    tone: clean(b.tone),
    doNotAnswer: clean(b.doNotAnswer),
    escalate: clean(b.escalate),
    aiEnabled: b.aiEnabled,
  };
  const k = await prisma.socialKnowledge.upsert({
    where: { clientId: b.clientId },
    create: { clientId: b.clientId, ...data, aiEnabled: b.aiEnabled ?? true },
    update: data,
  });
  return NextResponse.json({ ok: true, updatedAt: k.updatedAt });
});
