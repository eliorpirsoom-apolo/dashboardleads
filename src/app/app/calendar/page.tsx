import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import CalendarView from "@/components/tasks/CalendarView";

export const dynamic = "force-dynamic";

// לוח שנה צד לקוח — פתוח גם למשווקים: פגישות, משימות, חזרות ללידים וחוזים.
export default async function AppCalendarPage() {
  const user = (await getSession())!;
  const users = user.isAgent
    ? await prisma.user.findMany({ where: { id: user.id }, select: { id: true, name: true } })
    : await prisma.user.findMany({
        where: { clientId: user.clientId!, active: true },
        select: { id: true, name: true },
      });
  return (
    <>
      <PageHeader
        title="לוח שנה"
        subtitle="פגישות · משימות · חזרות ללידים · חוזים — לחיצה כפולה על יום מוסיפה"
      />
      <CalendarView isAdmin={false} clientId={user.clientId!} users={users} />
    </>
  );
}
