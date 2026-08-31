import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import TasksBoards from "@/components/tasks/TasksBoards";

export const dynamic = "force-dynamic";

// לוח משימות צד לקוח — פתוח גם למשווקים (בורד אישי בסגנון מאנדיי).
export default async function AppTasksPage() {
  const user = (await getSession())!;
  // משווק רואה רק את הבורד שלו; משתמש לקוח מלא — את כל בלוקי הצוות.
  const users = user.isAgent
    ? await prisma.user.findMany({
        where: { id: user.id },
        select: { id: true, name: true },
      })
    : await prisma.user.findMany({
        where: { clientId: user.clientId!, active: true },
        select: { id: true, name: true },
      });
  return (
    <>
      <PageHeader
        title="לוח משימות"
        subtitle="בלוק לכל איש צוות — גרירה מסדרת ומעבירה אחריות · חדש נכנס למעלה"
      />
      <TasksBoards users={users} clients={[]} meId={user.id} ownerSide="client" isAdmin={false} />
    </>
  );
}
