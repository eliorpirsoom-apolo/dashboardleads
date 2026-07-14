import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/messages?clientId&kind&channel&broadcastId&page
// The full outgoing-message log (admin: any client; client: its own).
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;

  const where: Prisma.MessageWhereInput = {};
  if (user.role === "ADMIN") {
    if (p.get("clientId")) where.clientId = p.get("clientId")!;
  } else {
    where.clientId = scopeClientId(user, p.get("clientId"));
  }
  if (p.get("kind")) where.kind = p.get("kind")!;
  if (p.get("channel")) where.channel = p.get("channel")!;
  if (p.get("broadcastId")) where.broadcastId = p.get("broadcastId")!;
  if (p.get("status")) where.status = p.get("status")!;

  const page = Math.max(1, Number(p.get("page") || 1));
  const pageSize = 50;

  const [total, messages] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        client: { select: { name: true, color: true } },
        lead: { select: { fullName: true, number: true } },
      },
    }),
  ]);

  return NextResponse.json({ messages, total, page, pageSize });
});
