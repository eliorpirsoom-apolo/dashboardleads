import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import CalendarView from "@/components/tasks/CalendarView";

export const dynamic = "force-dynamic";

export default async function AppCalendarPage() {
  const user = (await getSession())!;
  if (user.isAgent) redirect("/app"); // משווק — גישה מוגבלת ללידים ולפרויקטים שלו
  const users = await prisma.user.findMany({
    where: { clientId: user.clientId!, active: true },
    select: { id: true, name: true },
  });
  return (
    <>
      <PageHeader title="לוח שנה" subtitle="משימות ותזמונים — לחיצה כפולה על יום מוסיפה משימה" />
      <CalendarView isAdmin={false} clientId={user.clientId!} users={users} />
    </>
  );
}
