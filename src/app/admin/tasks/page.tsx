import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireAdminModule } from "@/lib/adminModules";
import TasksView from "@/components/tasks/TasksView";

export const dynamic = "force-dynamic";

export default async function AdminTasksPage() {
  await requireAdminModule("tasks");
  const [clients, admins] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="משימות"
        subtitle="כל המשימות והפגישות — של המשרד ושל הלקוחות"
      />
      <TasksView isAdmin clients={clients} users={admins} />
    </>
  );
}
