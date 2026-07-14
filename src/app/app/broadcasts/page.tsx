import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import BroadcastsView from "@/components/broadcasts/BroadcastsView";

export const dynamic = "force-dynamic";

export default async function AppBroadcastsPage() {
  const user = (await getSession())!;
  return (
    <>
      <PageHeader
        title="הודעות תפוצה"
        subtitle="שליחה מרוכזת ללידים עם הסכמה לדיוור + דוח מסירה"
      />
      <BroadcastsView clientId={user.clientId!} />
    </>
  );
}
