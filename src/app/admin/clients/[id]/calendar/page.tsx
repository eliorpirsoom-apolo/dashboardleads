import { prisma } from "@/lib/prisma";
import CalendarView from "@/components/tasks/CalendarView";

export const dynamic = "force-dynamic";

export default async function ClientCalendarPage({ params }: { params: { id: string } }) {
  const users = await prisma.user.findMany({
    where: { clientId: params.id, active: true },
    select: { id: true, name: true },
  });
  return <CalendarView isAdmin clientId={params.id} users={users} />;
}
