import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ApiError } from "@/lib/api";
import { requireSocialAccess } from "@/lib/social/access";
import { THREAD_STATUSES, PLATFORMS, THREAD_KINDS } from "@/lib/social/constants";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// GET /api/social/threads?clientId&platform&kind&status&page — רשימת הפניות
// (חדש למעלה) לתיבת המענה. קריאה בלבד (שלב 1a). ערך סינון לא מוכר → 400,
// כדי שבאג ב-UI לא יציג "הכול" כאילו הסינון הופעל.
export const GET = handle(async (req) => {
  await requireSocialAccess();
  const sp = new URL(req.url).searchParams;
  const pick = <T extends string>(key: string, allowed: readonly T[]): T | undefined => {
    const v = sp.get(key) ?? "";
    if (!v) return undefined;
    if (!(allowed as readonly string[]).includes(v)) throw new ApiError(400, `ערך לא תקין ל-${key}`);
    return v as T;
  };
  const clientId = sp.get("clientId") || undefined;
  const platform = pick("platform", PLATFORMS);
  const kind = pick("kind", THREAD_KINDS);
  const status = pick("status", THREAD_STATUSES);
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);

  const where = { clientId, platform, kind, status };
  const [threads, total, openCount] = await Promise.all([
    prisma.socialThread.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        platform: true,
        kind: true,
        status: true,
        needsHuman: true,
        reason: true,
        authorName: true,
        authorExtId: true,
        snippet: true,
        permalink: true,
        lastInboundAt: true,
        lastMessageAt: true,
        createdAt: true,
        client: { select: { id: true, name: true, color: true } },
        account: { select: { pageName: true, igUsername: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.socialThread.count({ where }),
    prisma.socialThread.count({ where: { ...where, status: "open" } }),
  ]);
  return NextResponse.json({ threads, total, openCount, page, pageSize: PAGE_SIZE });
});
