import { prisma } from "./prisma";
import type { SessionUser } from "./auth";

// ---------------------------------------------------------------------------
// Project scoping — "לכל פרויקט המשתמש והלידים שלו".
//
// A marketer (CLIENT + isAgent) sees ONLY the leads/data of the projects they
// are explicitly assigned to. **Default-deny**: a marketer with NO assignments
// sees nothing until the client owner assigns them a project. Owners
// (isAgent=false) and the agency (ADMIN) are never restricted.
// ---------------------------------------------------------------------------

/** Project ids the user is limited to, or null = unrestricted (owner/agency). */
export async function allowedProjectIds(
  user: SessionUser
): Promise<string[] | null> {
  if (user.role !== "CLIENT" || !user.isAgent) return null;
  const rows = await prisma.projectAssignment.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });
  // מפתח: משווק ללא שיוך → מערך ריק = אין גישה (לא "כל הלקוח").
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
