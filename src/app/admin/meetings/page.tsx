import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireAdminModule } from "@/lib/adminModules";
import MeetingsBoard from "@/components/meetings/MeetingsBoard";

export const dynamic = "force-dynamic";

// מודול סיכומי פגישות — צד משרד. קליטה מהבוט / ידני, בולטים + משימות, שליחה ללקוח.
export default async function AdminMeetingsPage() {
  await requireAdminModule("meetings");
  const clients = await prisma.client.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeader
        title="סיכומי פגישות"
        subtitle="מצלמים דף פגישה ושולחים לבוט — או יוצרים ידנית; מורידים משימות לביצוע ושולחים סיכום ללקוח"
      />
      <MeetingsBoard clients={clients} />
    </>
  );
}
