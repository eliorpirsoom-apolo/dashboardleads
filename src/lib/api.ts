import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSession, type SessionUser } from "./auth";

// ---------------------------------------------------------------------------
// API helpers — every route handler uses these so authentication, client
// scoping and error shapes stay consistent across the whole system.
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Wrap a route handler: ApiError → clean JSON error, anything else → 500. */
export function handle<
  T extends (req: Request, ctx: any) => Promise<Response>,
>(fn: T) {
  return async (req: Request, ctx: any): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) return jsonError(err.status, err.message);
      if (err instanceof ZodError) {
        const first = err.issues[0];
        return jsonError(400, first?.message || "קלט לא תקין");
      }
      console.error("[api]", err);
      return jsonError(500, "שגיאת שרת");
    }
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new ApiError(401, "נדרשת התחברות");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ApiError(403, "הרשאת מנהל בלבד");
  return user;
}

/**
 * THE scoping rule of the system. Resolves which client's data a request
 * may touch:
 *   - ADMIN must say which client (explicit requested id).
 *   - CLIENT is always forced to its own client; asking for another → 403.
 */
export function scopeClientId(
  user: SessionUser,
  requested?: string | null
): string {
  if (user.role === "ADMIN") {
    if (!requested) throw new ApiError(400, "חסר מזהה לקוח");
    return requested;
  }
  if (!user.clientId) throw new ApiError(403, "המשתמש אינו משויך ללקוח");
  if (requested && requested !== user.clientId) {
    throw new ApiError(403, "אין הרשאה ללקוח זה");
  }
  return user.clientId;
}

/** Read + validate a JSON body, throwing a clean 400 on garbage. */
export async function readJson<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "גוף הבקשה אינו JSON תקין");
  }
}
