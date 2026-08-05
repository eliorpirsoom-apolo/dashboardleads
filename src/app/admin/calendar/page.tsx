import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireAdminModule } from "@/lib/adminModules";
import CalendarView from "@/components/tasks/CalendarView";

export const dynamic = "force-dynamic";

export default async function AdminCalendarPage() {
  await requireAdminModule("calendar");
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
      <PageHeader title="לוח שנה" subtitle="כל הפגישות והמשימות של המשרד והלקוחות" />
      <CalendarView isAdmin clients={clients} users={admins} />
    </>
  );
}
