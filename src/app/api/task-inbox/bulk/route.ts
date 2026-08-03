import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

const BulkBody = z.object({
  ids: z.array(z.string().min(1)).min(1, "לא נבחרו פריטים").max(500),
  action: z.enum(["done", "inbox", "delete"]),
});

// POST /api/task-inbox/bulk — פעולה על כמה פריטים בבת אחת (סימון בוצע / מחיקה).
export const POST = handle(async (req) => {
  await requireAdmin();
  const { ids, action } = BulkBody.parse(await readJson(req));
  if (action === "delete") {
    const r = await prisma.taskInbox.deleteMany({ where: { id: { in: ids } } });
    return NextResponse.json({ count: r.count });
  }
  const r = await prisma.taskInbox.updateMany({
    where: { id: { in: ids } },
    data: { status: action },
  });
  return NextResponse.json({ count: r.count });
});
