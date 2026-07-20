import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { googleEnabled, googleRedirectUri } from "@/lib/google";
import { GOOGLE_SCOPES, packState } from "@/lib/integrations/googleData";

export const dynamic = "force-dynamic";

// GET /api/integrations/google/connect?clientId&kind=search_console|ga4
//     /api/integrations/google/connect?kind=calendar   (יומן אישי של העובד)
// Starts the Google data OAuth (offline access for refresh token).
export const GET = handle(async (req) => {
  const user = await requireAdmin();
  if (!googleEnabled()) {
    throw new ApiError(400, "חיבור Google לא מוגדר (GOOGLE_CLIENT_ID/SECRET)");
  }
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  if (!kind || !GOOGLE_SCOPES[kind]) {
    throw new ApiError(400, "חסר kind (search_console/ga4/calendar)");
  }

  // calendar מחובר למשתמש המחובר; שאר הסוגים — ללקוח מסוים.
  let subject: string;
  if (kind === "calendar") {
    subject = user.id;
  } else {
    const clientId = url.searchParams.get("clientId");
    if (!clientId) throw new ApiError(400, "חסר clientId");
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new ApiError(404, "לקוח לא נמצא");
    subject = clientId;
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    // Same callback host as the login flow; route distinguishes by state.
    redirect_uri: `${url.origin}/api/integrations/google/callback`,
    response_type: "code",
    scope: GOOGLE_SCOPES[kind],
    access_type: "offline",
    prompt: "consent", // force refresh_token issuance
    state: packState(subject, kind),
  });
  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  );
});
