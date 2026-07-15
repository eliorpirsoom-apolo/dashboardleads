import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/client-users?clientId — the client's active users, for assignee
// dropdowns (both sides use this; scoped like everything else).
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));
  const users = await prisma.user.findMany({
    where: { clientId, active: true },
    select: { id: true, name: true, isAgent: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users });
});
