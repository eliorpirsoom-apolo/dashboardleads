import { prisma } from "./prisma";
import type { SessionUser } from "./auth";

// יומן פעולות רגישות — נכתב מכל ראוט שמשנה משתמשים/לקוחות/חיבורים.
export async function audit(
  actor: SessionUser,
  action: string,
  targetType: string,
  targetId?: string | null,
  details?: string
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorName: actor.name,
        actorId: actor.id,
        action,
        targetType,
        targetId: targetId ?? null,
        details: details ?? null,
      },
    });
  } catch (err) {
    // Auditing must never break the action itself.
    console.error("[audit]", err);
  }
}
