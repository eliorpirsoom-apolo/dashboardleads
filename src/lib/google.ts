// ---------------------------------------------------------------------------
// Google OAuth (login with Google) — hand-rolled authorization-code flow,
// no extra dependencies. Enabled only when GOOGLE_CLIENT_ID/SECRET are set;
// until then the login page simply hides the Google button.
//
// The redirect URI is derived from the request origin, so the same code
// works on localhost, Vercel previews and production. The user registers
// the exact URIs in Google Cloud Console (see CONNECTIONS.md).
// ---------------------------------------------------------------------------

export function googleEnabled(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

export function googleRedirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

export function googleAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
}

/** Exchange the auth code for tokens and decode the id_token payload. */
export async function exchangeGoogleCode(
  origin: string,
  code: string
): Promise<GoogleProfile> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: googleRedirectUri(origin),
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status}`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Google response missing id_token");

  // The id_token comes straight from Google over TLS — decode its payload.
  const payload = JSON.parse(
    Buffer.from(data.id_token.split(".")[1], "base64url").toString("utf8")
  );
  if (!payload.email) throw new Error("Google id_token missing email");
  return {
    sub: String(payload.sub),
    email: String(payload.email).toLowerCase(),
    name: String(payload.name || payload.email),
  };
}
