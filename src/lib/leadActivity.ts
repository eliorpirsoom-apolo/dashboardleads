import { prisma } from "./prisma";

// ציר הפעילות של ליד — כל אירוע משמעותי נרשם כאן אוטומטית.
export type ActivityKind =
  | "create"
  | "status"
  | "assign"
  | "project"
  | "archive"
  | "restore"
  | "consent"
  | "merge"
  | "import"
  | "repeat" // הליד פנה שוב (כפילות בחלון 24 שעות)
  | "call_attempt"; // ניסיון חיוג מהיר ("חייגתי — אין מענה" וכד')

export async function recordActivity(
  leadId: string,
  actorName: string,
  kind: ActivityKind,
  extra?: { fromValue?: string | null; toValue?: string | null; note?: string }
): Promise<void> {
  try {
    await prisma.leadActivity.create({
      data: {
        leadId,
        actorName,
        kind,
        fromValue: extra?.fromValue ?? null,
        toValue: extra?.toValue ?? null,
        note: extra?.note ?? null,
      },
    });
  } catch (err) {
    // ציר הפעילות לא מפיל את הפעולה עצמה.
    console.error("[leadActivity]", err);
  }
  // Speed-to-Lead: שינוי סטטוס = הליד טופל (נגיעה מכירתית ראשונה).
  if (kind === "status") await markLeadHandled(leadId);
}

/** Speed-to-Lead: מסמן שהליד קיבל טיפול ראשון (סטטוס/הערה). אידמפוטנטי. */
export async function markLeadHandled(leadId: string): Promise<void> {
  await prisma.lead
    .updateMany({
      where: { id: leadId, firstHandledAt: null },
      data: { firstHandledAt: new Date() },
    })
    .catch(() => {});
}

/**
 * Round-robin auto-assignment: pick the client's active sales agent with the
 * fewest non-archived leads (ties → least recently assigned). Falls back to
 * null when the client has no active agents.
 * candidateIds (optional) limits the pool — e.g. the agents of one project.
 */
export async function pickAutoAssignee(
  clientId: string,
  candidateIds?: string[]
): Promise<string | null> {
  const agents = await prisma.user.findMany({
    where: {
      clientId,
      active: true,
      isAgent: true,
      ...(candidateIds ? { id: { in: candidateIds } } : {}),
    },
    select: { id: true },
  });
  if (agents.length === 0) return null;

  const counts = await prisma.lead.groupBy({
    by: ["assigneeId"],
    where: {
      clientId,
      archived: false,
      assigneeId: { in: agents.map((a) => a.id) },
    },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.assigneeId, c._count._all]));
  let best = agents[0].id;
  let bestCount = countMap.get(best) ?? 0;
  for (const agent of agents.slice(1)) {
    const c = countMap.get(agent.id) ?? 0;
    if (c < bestCount) {
      best = agent.id;
      bestCount = c;
    }
  }
  return best;
}
