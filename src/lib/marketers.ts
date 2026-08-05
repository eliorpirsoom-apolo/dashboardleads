import { prisma } from "./prisma";
import { requireUser, ApiError } from "./api";

// רק בעל-הכרטיס (משתמש-לקוח שאינו משווק) מנהל משווקים. מנהל המשרד מנהל דרך המשרד.
export async function requireClientOwner() {
  const user = await requireUser();
  if (user.role !== "CLIENT" || user.isAgent || !user.clientId) {
    throw new ApiError(403, "רק בעל הכרטיס יכול לנהל משווקים");
  }
  return user as typeof user & { clientId: string };
}

// שיוך פרויקטים למשווק: משאיר רק את הפרויקטים שנבחרו (מתוך פרויקטי הלקוח בלבד).
export async function reconcileProjects(userId: string, clientId: string, projectIds: string[]) {
  const valid = await prisma.project.findMany({
    where: { id: { in: projectIds }, clientId },
    select: { id: true },
  });
  const validIds = new Set(valid.map((p) => p.id));
  const current = await prisma.projectAssignment.findMany({
    where: { userId },
    select: { projectId: true },
  });
  const currentIds = new Set(current.map((a) => a.projectId));
  const toAdd = [...validIds].filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !validIds.has(id));
  if (toRemove.length) {
    await prisma.projectAssignment.deleteMany({ where: { userId, projectId: { in: toRemove } } });
  }
  if (toAdd.length) {
    await prisma.projectAssignment.createMany({
      data: toAdd.map((projectId) => ({ userId, projectId })),
    });
  }
}
