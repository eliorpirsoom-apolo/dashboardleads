import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// First-run bootstrap: creates the FIRST admin account on a fresh production
// database. Hard-disabled the moment any user exists — safe to leave in.
// ---------------------------------------------------------------------------

export async function GET() {
  const users = await prisma.user.count();
  return NextResponse.json({ needsSetup: users === 0 });
}

const Setup = z.object({
  name: z.string().min(1, "חסר שם").max(120),
  email: z.string().email("אימייל לא תקין"),
  password: z.string().min(8, "סיסמה קצרה מדי (מינימום 8 תווים)"),
});

export async function POST(req: Request) {
  if (!rateLimit("setup", 5, 60_000)) {
    return NextResponse.json({ error: "יותר מדי ניסיונות" }, { status: 429 });
  }

  const users = await prisma.user.count();
  if (users > 0) {
    return NextResponse.json(
      { error: "המערכת כבר הוגדרה — קיימים משתמשים" },
      { status: 403 }
    );
  }

  let body;
  try {
    body = Setup.parse(await req.json());
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.issues?.[0]?.message ?? "קלט לא תקין" },
      { status: 400 }
    );
  }

  const user = await prisma.user.create({
    data: {
      email: body.email.toLowerCase().trim(),
      name: body.name,
      passwordHash: hashPassword(body.password),
      role: "ADMIN",
    },
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken(user.id, user.tokenVersion),
    sessionCookieOptions
  );
  return res;
}
