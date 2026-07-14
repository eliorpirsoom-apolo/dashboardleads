import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { exchangeGoogleCode, googleEnabled } from "@/lib/google";

export const dynamic = "force-dynamic";

// Google redirects here after consent. No self-signup: the account must
// already exist (provisioned by the agency) — we match by googleId, then by
// email, and link the googleId on first Google login.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (code: string) =>
    NextResponse.redirect(new URL(`/login?error=${code}`, request.url));

  if (!googleEnabled()) return fail("google_disabled");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = cookies().get("g_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("google_state");
  }

  try {
    const profile = await exchangeGoogleCode(url.origin, code);

    let user = await prisma.user.findUnique({
      where: { googleId: profile.sub },
    });
    if (!user) {
      user = await prisma.user.findUnique({
        where: { email: profile.email },
      });
      if (user && !user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId: profile.sub },
        });
      }
    }
    if (!user || !user.active) return fail("no_account");

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const res = NextResponse.redirect(new URL("/", request.url));
    res.cookies.set(
      SESSION_COOKIE,
      createSessionToken(user.id),
      sessionCookieOptions
    );
    res.cookies.set("g_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("[api/auth/google/callback]", err);
    return fail("google_error");
  }
}
