import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// Auth — built on Node's `crypto` only (no native addons, which Windows
// Application Control may block). scrypt for passwords, HMAC-signed cookie
// for sessions.
// ---------------------------------------------------------------------------

const SECRET =
  process.env.AUTH_SECRET || "dev-insecure-secret-change-me-in-production";
export const SESSION_COOKIE = "ld_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type Role = "ADMIN" | "CLIENT";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  clientId: string | null;
  clientName: string | null;
}

// --- Password hashing -------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- Session tokens ---------------------------------------------------------

function sign(value: string): string {
  return crypto.createHmac("sha256", SECRET).update(value).digest("hex");
}

export function createSessionToken(userId: string): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, sig] = parts;
  const payload = `${userId}.${expires}`;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(expires) < Date.now()) return null;
  return userId;
}

// --- Session lookup ---------------------------------------------------------

export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { client: true },
  });
  if (!user || !user.active) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    clientId: user.clientId,
    clientName: user.client?.name ?? null,
  };
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
};

// --- Scoping helpers --------------------------------------------------------

/**
 * Prisma `where` fragment that scopes Client queries to what the user may see.
 * Admins see everything ({}), clients only their own client.
 */
export function clientScopeWhere(user: SessionUser): { id?: string } {
  if (user.role === "ADMIN") return {};
  return { id: user.clientId ?? "__none__" };
}

/** Throw if the user may not access the given clientId. */
export function assertClientAccess(user: SessionUser, clientId: string): void {
  if (user.role === "ADMIN") return;
  if (user.clientId !== clientId) {
    throw new Error("FORBIDDEN");
  }
}
