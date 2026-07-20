import { prisma } from "./prisma";
import { ilDateKey } from "./time";

/** Daily lead counts for the last `days` days (Israel calendar days).
 *  projectIds limits the trend to specific projects (agent scoping). */
export async function leadTrend(
  clientId: string | null,
  days = 30,
  projectIds?: string[] | null
): Promise<{ date: string; לידים: number }[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const leads = await prisma.lead.findMany({
    where: {
      archived: false,
      receivedAt: { gte: since },
      ...(clientId ? { clientId } : {}),
      ...(projectIds ? { projectId: { in: projectIds } } : {}),
    },
    select: { receivedAt: true },
  });

  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    buckets.set(ilDateKey(d), 0);
  }
  for (const lead of leads) {
    const key = ilDateKey(lead.receivedAt);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({
    date: date.slice(5), // "07-15"
    לידים: count,
  }));
}
