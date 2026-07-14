import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "נא להזין אימייל וסיסמה" },
        { status: 400 }
      );
    }

    // Brute-force guard: 10 attempts/min per email+IP.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
    if (!rateLimit(`login:${String(email).toLowerCase()}:${ip}`, 10, 60_000)) {
      return NextResponse.json(
        { error: "יותר מדי ניסיונות — נסו שוב בעוד דקה" },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase().trim() },
    });

    // passwordHash is null for Google-only accounts — they must use Google.
    if (
      !user ||
      !user.active ||
      !user.passwordHash ||
      !verifyPassword(String(password), user.passwordHash)
    ) {
      return NextResponse.json(
        { error: "אימייל או סיסמה שגויים" },
        { status: 401 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const res = NextResponse.json({ ok: true, role: user.role });
    res.cookies.set(
      SESSION_COOKIE,
      createSessionToken(user.id),
      sessionCookieOptions
    );
    return res;
  } catch (err) {
    console.error("[api/auth/login]", err);
    return NextResponse.json({ error: "שגיאת התחברות" }, { status: 500 });
  }
}
