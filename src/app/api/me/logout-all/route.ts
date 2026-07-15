import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/me/logout-all — revoke every session of the current user
// (all devices), including this one.
export const POST = handle(async () => {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { tokenVersion: { increment: 1 } },
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
