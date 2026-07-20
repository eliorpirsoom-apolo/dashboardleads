import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { unpackState } from "@/lib/integrations/googleData";

export const dynamic = "force-dynamic";

// Google redirects here after consenting to data scopes. Stores the refresh
// token on the client's Integration row and bounces back to its settings.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getSession();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const parsed = state ? unpackState(state) : null;
  if (!code || !parsed) {
    return NextResponse.redirect(new URL("/admin?error=google_data", request.url));
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${url.origin}/api/integrations/google/callback`,
      }),
    });
    if (!res.ok) throw new Error(`token exchange ${res.status}`);
    const tokens = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // יומן אישי: נשמר על המשתמש המחובר (לא על לקוח).
    if (parsed.kind === "calendar") {
      if (parsed.clientId !== user.id) {
        return NextResponse.redirect(new URL("/admin/calendar?gcal=error", request.url));
      }
      if (!tokens.refresh_token) {
        return NextResponse.redirect(new URL("/admin/calendar?gcal=error", request.url));
      }
      // כתובת ה-Gmail של היומן — המזהה של יומן ה-primary.
      const calRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary?fields=id",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const googleEmail = calRes.ok
        ? String(((await calRes.json()) as { id: string }).id)
        : "";

      const { CONNECTION_COLORS } = await import("@/lib/gcal");
      const existingCount = await prisma.calendarConnection.count();
      await prisma.calendarConnection.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          googleEmail,
          refreshToken: tokens.refresh_token,
          accessToken: tokens.access_token,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          color: CONNECTION_COLORS[existingCount % CONNECTION_COLORS.length],
        },
        update: {
          googleEmail,
          refreshToken: tokens.refresh_token,
          accessToken: tokens.access_token,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          active: true,
          lastError: null,
        },
      });
      return NextResponse.redirect(new URL("/admin/calendar?gcal=connected", request.url));
    }

    await prisma.integration.upsert({
      where: {
        clientId_kind: { clientId: parsed.clientId, kind: parsed.kind },
      },
      create: {
        clientId: parsed.clientId,
        kind: parsed.kind,
        status: "connected",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      update: {
        status: "connected",
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        lastError: null,
      },
    });

    return NextResponse.redirect(
      new URL(`/admin/clients/${parsed.clientId}/seo?connected=${parsed.kind}`, request.url)
    );
  } catch (err) {
    console.error("[google data callback]", err);
    return NextResponse.redirect(
      parsed.kind === "calendar"
        ? new URL("/admin/calendar?gcal=error", request.url)
        : new URL(`/admin/clients/${parsed.clientId}/seo?error=google_data`, request.url)
    );
  }
}
