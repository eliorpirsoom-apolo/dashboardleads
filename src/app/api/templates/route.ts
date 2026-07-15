import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/templates?clientId&channel — saved message templates.
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));
  const templates = await prisma.messageTemplate.findMany({
    where: {
      clientId,
      ...(p.get("channel") ? { channel: p.get("channel")! } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ templates });
});

const CreateTemplate = z.object({
  clientId: z.string().optional(),
  name: z.string().min(1, "חסר שם תבנית").max(120),
  channel: z.enum(["email", "sms", "whatsapp"]),
  subject: z.string().max(200).nullable().optional(),
  body: z.string().min(1, "חסר תוכן").max(3000),
});

// POST /api/templates — save (same name overwrites).
export const POST = handle(async (req) => {
  const user = await requireUser();
  assertNotAgent(user);
  const body = CreateTemplate.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  const template = await prisma.messageTemplate.upsert({
    where: { clientId_name: { clientId, name: body.name } },
    create: {
      clientId,
      name: body.name,
      channel: body.channel,
      subject: body.subject ?? null,
      body: body.body,
    },
    update: {
      channel: body.channel,
      subject: body.subject ?? null,
      body: body.body,
    },
  });
  return NextResponse.json({ template }, { status: 201 });
});

// DELETE /api/templates?id=...
export const DELETE = handle(async (req) => {
  const user = await requireUser();
  assertNotAgent(user);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ApiError(400, "חסר מזהה");
  const existing = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "תבנית לא נמצאה");
  scopeClientId(user, existing.clientId);
  await prisma.messageTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
