import { prisma } from "./prisma";
import type { SessionUser } from "./auth";

// ---------------------------------------------------------------------------
// Project scoping — "לכל פרויקט המשתמש והלידים שלו".
//
// A sales agent that is assigned to projects sees ONLY those projects' leads
// (and derived screens). An agent with no assignments keeps the legacy
// behavior — the whole client. Owners and the agency are never restricted.
// ---------------------------------------------------------------------------

/** Project ids the user is limited to, or null = unrestricted. */
export async function allowedProjectIds(
  user: SessionUser
): Promise<string[] | null> {
  if (user.role !== "CLIENT" || !user.isAgent) return null;
  const rows = await prisma.projectAssignment.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });
  if (rows.length === 0) return null;
  return rows.map((r) => r.projectId);
}

/** Prisma where-fragment limiting leads to the allowed projects. */
export function leadProjectWhere(
  projectIds: string[] | null
): Record<string, unknown> {
  return projectIds ? { projectId: { in: projectIds } } : {};
}

/** Throws-free check: may this user touch a lead in the given project? */
export function projectAllowed(
  projectIds: string[] | null,
  projectId: string | null
): boolean {
  if (!projectIds) return true;
  return projectId !== null && projectIds.includes(projectId);
}
