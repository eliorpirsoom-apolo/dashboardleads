import { Prisma } from "@prisma/client";

/** Translate leads-table query params into a scoped Prisma where clause. */
export function buildLeadWhere(
  clientId: string,
  p: URLSearchParams
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { clientId, archived: false };
  if (p.get("statusId")) where.statusId = p.get("statusId")!;
  if (p.get("campaignId")) where.campaignId = p.get("campaignId")!;
  if (p.get("projectId")) where.projectId = p.get("projectId")!;
  if (p.get("channel")) where.channel = p.get("channel")!;
  if (p.get("kind")) where.kind = p.get("kind")!;
  if (p.get("consent") === "true") where.consent = true;
  const from = p.get("from");
  const to = p.get("to");
  if (from || to) {
    where.receivedAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
    };
  }
  const q = p.get("q")?.trim();
  if (q) {
    const num = Number(q);
    where.OR = [
      { fullName: { contains: q } },
      { phone: { contains: q.replace(/[^\d+]/g, "") || q } },
      { email: { contains: q.toLowerCase() } },
      { city: { contains: q } },
      ...(Number.isInteger(num) && num > 0 ? [{ number: num }] : []),
    ];
  }
  return where;
}
