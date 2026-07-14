import { prisma } from "@/lib/prisma";
import TasksView from "@/components/tasks/TasksView";

export const dynamic = "force-dynamic";

export default async function ClientTasksPage({ params }: { params: { id: string } }) {
  const users = await prisma.user.findMany({
    where: { clientId: params.id, active: true },
    select: { id: true, name: true },
  });
  return <TasksView isAdmin clientId={params.id} users={users} />;
}
