import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson } from "@/lib/api";
import { requireManager } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.literal("dedupe-repeat-activities"),
  leadId: z.string().min(1),
});

// POST /api/admin-ops/cleanup — ניקוי רשומות זבל (מנהל בלבד).
// dedupe-repeat-activities: משאיר את רשומת "פנייה חוזרת" הראשונה של הליד
// ומוחק את השאר — לניקוי אחרי לולאת התראות (הליד עצמו לא נגע).
export const POST = handle(async (req) => {
  await requireManager();
  const b = Body.parse(await readJson(req));

  const acts = await prisma.leadActivity.findMany({
    where: { leadId: b.leadId, kind: "repeat" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (acts.length <= 1) return NextResponse.json({ deleted: 0, kept: acts.length });
  const res = await prisma.leadActivity.deleteMany({
    where: { id: { in: acts.slice(1).map((a) => a.id) } },
  });
  return NextResponse.json({ deleted: res.count, kept: 1 });
});
