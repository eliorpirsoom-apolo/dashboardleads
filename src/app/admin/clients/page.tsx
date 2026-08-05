import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireAdminModule } from "@/lib/adminModules";
import ClientsGrid, { type ClientCard } from "@/components/clients/ClientsGrid";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  await requireAdminModule("clients");
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [clients, newLeads, openTasks] = await Promise.all([
    prisma.client.findMany({
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { users: true, leads: true } } },
    }),
    prisma.lead.groupBy({
      by: ["clientId"],
      where: { receivedAt: { gte: weekAgo }, archived: false },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["clientId"],
      where: { status: "open", clientId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const newLeadsMap = Object.fromEntries(newLeads.map((g) => [g.clientId, g._count._all]));
  const tasksMap = Object.fromEntries(openTasks.map((g) => [g.clientId as string, g._count._all]));

  const cards: ClientCard[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    company: c.company,
    contactName: c.contactName,
    color: c.color,
    active: c.active,
    newLeadsWeek: newLeadsMap[c.id] ?? 0,
    openTasks: tasksMap[c.id] ?? 0,
    _count: c._count,
  }));

  return (
    <>
      <PageHeader title="לקוחות" subtitle="כל לקוחות המשרד — לחיצה נכנסת למרחב העבודה של הלקוח" />
      <ClientsGrid clients={cards} />
    </>
  );
}
