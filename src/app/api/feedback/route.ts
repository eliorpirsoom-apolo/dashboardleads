import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson } from "@/lib/api";
import { requireManager } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/feedback — תיבת המשוב הניהולית (מנהל בלבד). ?resolved=1 לסינון.
export const GET = handle(async (req) => {
  await requireManager();
  const p = new URL(req.url).searchParams;
  const where = p.get("resolved") === "1" ? { resolved: true } : p.get("resolved") === "0" ? { resolved: false } : {};
  const [items, openCount] = await Promise.all([
    prisma.feedback.findMany({ where, orderBy: [{ resolved: "asc" }, { createdAt: "desc" }], take: 200 }),
    prisma.feedback.count({ where: { resolved: false } }),
  ]);
  return NextResponse.json({ items, openCount });
});

const NewFeedback = z.object({
  category: z.enum(["improvement", "bug", "idea", "other"]).default("improvement"),
  text: z.string().min(2, "המשוב קצר מדי").max(4000),
});

// POST /api/feedback — כל עובד משרד יכול לשלוח משוב.
export const POST = handle(async (req) => {
  const user = await requireAdmin();
  const body = NewFeedback.parse(await readJson(req));
  const item = await prisma.feedback.create({
    data: {
      authorId: user.id,
      authorName: user.name,
      category: body.category,
      text: body.text.trim(),
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: item.id }, { status: 201 });
});
