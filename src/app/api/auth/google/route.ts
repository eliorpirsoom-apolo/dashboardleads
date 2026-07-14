import { NextResponse } from "next/server";
import crypto from "crypto";
import { googleEnabled, googleAuthUrl } from "@/lib/google";

export const dynamic = "force-dynamic";

// Kick off the Google OAuth flow. The state lands in a short-lived cookie
// and is verified on callback (CSRF protection).
export async function GET(request: Request) {
  if (!googleEnabled()) {
    return NextResponse.redirect(
      new URL("/login?error=google_disabled", request.url)
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  const origin = new URL(request.url).origin;
  const res = NextResponse.redirect(googleAuthUrl(origin, state));
  res.cookies.set("g_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
