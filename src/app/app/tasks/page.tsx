import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import TasksView from "@/components/tasks/TasksView";

export const dynamic = "force-dynamic";

export default async function AppTasksPage() {
  const user = (await getSession())!;
  if (user.isAgent) redirect("/app"); // משווק — גישה מוגבלת ללידים ולפרויקטים שלו
  const users = await prisma.user.findMany({
    where: { clientId: user.clientId!, active: true },
    select: { id: true, name: true },
  });
  return (
    <>
      <PageHeader
        title="משימות"
        subtitle="משימות יומיות ופגישות — עם תזכורות למייל (SMS/וואטסאפ בהמשך)"
      />
      <TasksView isAdmin={false} clientId={user.clientId!} users={users} />
    </>
  );
}
