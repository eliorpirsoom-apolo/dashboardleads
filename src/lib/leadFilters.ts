import { Prisma } from "@prisma/client";

/** Translate leads-table query params into a scoped Prisma where clause.
 *  allowedProjects (from projectScope) hard-limits agents to their projects,
 *  regardless of the requested filters. */
export function buildLeadWhere(
  clientId: string,
  p: URLSearchParams,
  currentUserId?: string,
  allowedProjects?: string[] | null
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {
    clientId,
    archived: p.get("archived") === "true",
  };
  if (p.get("statusId")) where.statusId = p.get("statusId")!;
  const assignee = p.get("assigneeId");
  if (assignee === "me" && currentUserId) where.assigneeId = currentUserId;
  else if (assignee === "none") where.assigneeId = null;
  else if (assignee) where.assigneeId = assignee;
  if (p.get("campaignId")) where.campaignId = p.get("campaignId")!;
  const proj = p.get("projectId");
  if (proj === "none") where.projectId = null;
  else if (proj) where.projectId = proj;
  if (allowedProjects) {
    where.projectId =
      proj && proj !== "none" && allowedProjects.includes(proj)
        ? proj
        : { in: allowedProjects };
  }
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
