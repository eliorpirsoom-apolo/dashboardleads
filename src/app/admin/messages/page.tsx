import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import MessagesLog from "@/components/messages/MessagesLog";

export const dynamic = "force-dynamic";

// Agency-wide outgoing-messages log: reminders, automations, broadcasts.
export default async function AdminMessagesPage() {
  const clients = await prisma.client.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        title="יומן הודעות"
        subtitle="כל מה שנשלח מהמערכת — תזכורות, אוטומציות ותפוצה, בכל הערוצים"
      />
      <MessagesLog clients={clients} />
    </>
  );
}
