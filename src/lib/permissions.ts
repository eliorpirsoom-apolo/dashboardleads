import { ApiError, requireUser } from "./api";
import type { SessionUser } from "./auth";

// ---------------------------------------------------------------------------
// Permission model (approved plan, decisions 1+2):
//
// Agency (ADMIN):
//   manager — everything.
//   staff   — daily work on clients; BLOCKED from: creating/editing/deactivating
//             clients, managing users, integrations, and system settings.
//
// Client (CLIENT):
//   owner — everything within their client.
//   agent (isAgent) — works: leads, tasks, calendar, purchase requests,
//             inventory "sold" updates; views documents & reports.
//             BLOCKED from: settings (statuses/custom fields/automations),
//             broadcasts, budgets, contracts editing, price/stock config.
//
// The rule: "הבעלים מגדיר, הסוכן עובד".
// ---------------------------------------------------------------------------

export function isManager(user: SessionUser): boolean {
  return user.role === "ADMIN" && user.adminRole !== "staff";
}

/** Agency manager only (destructive/config actions on the agency side). */
export async function requireManager(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ApiError(403, "הרשאת מנהל בלבד");
  if (user.adminRole === "staff") {
    throw new ApiError(403, "פעולה זו שמורה למנהל המשרד");
  }
  return user;
}

/**
 * Blocks client-side sales agents from configuration actions.
 * Admins and client owners pass through.
 */
export function assertNotAgent(user: SessionUser, what = "פעולה זו"): void {
  if (user.role === "CLIENT" && user.isAgent) {
    throw new ApiError(403, `${what} שמורה לבעלים של החשבון`);
  }
}

/** requireUser + assertNotAgent in one call, for config routes. */
export async function requireConfigAccess(what?: string): Promise<SessionUser> {
  const user = await requireUser();
  assertNotAgent(user, what);
  return user;
}
