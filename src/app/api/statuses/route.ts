import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/statuses?clientId=... — the client's statuses, ordered.
export const GET = handle(async (req) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const clientId = scopeClientId(user, url.searchParams.get("clientId"));
  const statuses = await prisma.leadStatus.findMany({
    where: { clientId },
    orderBy: { order: "asc" },
    include: { _count: { select: { leads: true } } },
  });
  return NextResponse.json({ statuses });
});

const CreateStatus = z.object({
  clientId: z.string().optional(),
  name: z.string().min(1, "חסר שם סטטוס").max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "צבע לא תקין"),
  systemKind: z.enum(["new", "in_progress", "won", "lost"]),
});

// POST /api/statuses — client-defined status (name + color + kind).
export const POST = handle(async (req) => {
  const user = await requireUser();
  assertNotAgent(user);
  const body = CreateStatus.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  const last = await prisma.leadStatus.findFirst({
    where: { clientId },
    orderBy: { order: "desc" },
  });
  const status = await prisma.leadStatus.create({
    data: {
      clientId,
      name: body.name,
      color: body.color,
      systemKind: body.systemKind,
      order: (last?.order ?? -1) + 1,
    },
  });
  return NextResponse.json({ status }, { status: 201 });
});
