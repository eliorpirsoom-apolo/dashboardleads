import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/task-inbox?status=inbox|handled|all — מאגר לכידה משותף לכל המשרד.
export const GET = handle(async (req) => {
  await requireAdmin();
  const status = new URL(req.url).searchParams.get("status") || "inbox";
  const where: Record<string, unknown> = {};
  if (status === "handled") where.status = { in: ["done", "converted"] };
  else if (status && status !== "all") where.status = status;

  const [items, openCount] = await Promise.all([
    prisma.taskInbox.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.taskInbox.count({ where: { status: "inbox" } }),
  ]);
  return NextResponse.json({ items, openCount });
});

const NewItem = z.object({ text: z.string().min(1, "טקסט ריק").max(2000) });

// POST /api/task-inbox — לכידה מהירה (ידני). בעתיד: סוכן AI יזין עם source="whatsapp".
export const POST = handle(async (req) => {
  const user = await requireAdmin();
  const b = NewItem.parse(await readJson(req));
  const item = await prisma.taskInbox.create({
    data: {
      text: b.text.trim(),
      source: "manual",
      createdById: user.id,
      createdByName: user.name,
    },
  });
  return NextResponse.json({ item }, { status: 201 });
});
