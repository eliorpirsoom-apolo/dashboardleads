import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// עסקאות שנסגרו בטווח זמן — לפי ציר הפעילות (מעבר לסטטוס מסוג "עסקה"),
// מסונן ללידים שעדיין בסטטוס עסקה (מעבר שבוטל לא נספר).
// משמש את באנר "נסגרה עסקה" ואת תקציר הבוקר.
// ---------------------------------------------------------------------------

export interface WonDeal {
  leadId: string;
  number: number;
  fullName: string | null;
  clientName: string;
  projectName: string | null;
  at: Date;
}

export async function wonDeals(from: Date, to: Date): Promise<WonDeal[]> {
  const wonStatusNames = await prisma.leadStatus.findMany({
    where: { systemKind: "won" },
    select: { name: true },
  });
  if (wonStatusNames.length === 0) return [];
  const names = [...new Set(wonStatusNames.map((s) => s.name))];

  const acts = await prisma.leadActivity.findMany({
    where: {
      kind: "status",
      createdAt: { gte: from, lt: to },
      toValue: { in: names },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      lead: {
        select: {
          id: true,
          number: true,
          fullName: true,
          archived: true,
          status: { select: { systemKind: true } },
          client: { select: { name: true } },
          project: { select: { name: true } },
        },
      },
    },
  });

  const seen = new Set<string>();
  const deals: WonDeal[] = [];
  for (const a of acts) {
    if (!a.lead || a.lead.archived) continue;
    if (a.lead.status?.systemKind !== "won") continue;
    if (seen.has(a.lead.id)) continue;
    seen.add(a.lead.id);
    deals.push({
      leadId: a.lead.id,
      number: a.lead.number,
      fullName: a.lead.fullName,
      clientName: a.lead.client.name,
      projectName: a.lead.project?.name ?? null,
      at: a.createdAt,
    });
  }
  return deals;
}
