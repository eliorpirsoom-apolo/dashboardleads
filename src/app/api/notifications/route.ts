import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/notifications — ההתראות של המשתמש הנוכחי + מונה שלא-נקראו.
// ?count=1 — מונה בלבד (לפולינג הפעמון, זול).
export const GET = handle(async (req) => {
  const user = await requireAdmin();
  const countOnly = new URL(req.url).searchParams.get("count") === "1";
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  if (countOnly) return NextResponse.json({ unread });
  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ unread, items });
});

const MarkRead = z.object({
  ids: z.array(z.string()).max(200).optional(),
  all: z.boolean().optional(),
});

// POST /api/notifications — סימון כנקרא ({all:true} או {ids:[...]}).
export const POST = handle(async (req) => {
  const user = await requireAdmin();
  const b = MarkRead.parse(await readJson(req));
  const where = b.all
    ? { userId: user.id, readAt: null }
    : { userId: user.id, id: { in: b.ids ?? [] } };
  const r = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
  return NextResponse.json({ marked: r.count });
});
