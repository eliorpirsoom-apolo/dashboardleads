import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// Lead sources (intake tokens) are agency-managed — tokens are secrets.

// GET /api/sources?clientId=...
export const GET = handle(async (req) => {
  await requireAdmin();
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) throw new ApiError(400, "חסר מזהה לקוח");
  const sources = await prisma.leadSource.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { leads: true } } },
  });
  return NextResponse.json({ sources });
});

const CreateSource = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1, "חסר שם מקור").max(120),
  channel: z.string().max(40).optional().nullable(),
  platform: z.string().max(40).optional().nullable(),
  kind: z.enum(["form", "call", "whatsapp"]).default("form"),
});

// POST /api/sources — creates an intake endpoint with a fresh token.
export const POST = handle(async (req) => {
  await requireAdmin();
  const body = CreateSource.parse(await readJson(req));

  const client = await prisma.client.findUnique({ where: { id: body.clientId } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");

  const source = await prisma.leadSource.create({
    data: {
      clientId: body.clientId,
      name: body.name,
      channel: body.channel || null,
      platform: body.platform || null,
      kind: body.kind,
      token: `src_${crypto.randomBytes(18).toString("hex")}`,
    },
  });
  return NextResponse.json({ source }, { status: 201 });
});
