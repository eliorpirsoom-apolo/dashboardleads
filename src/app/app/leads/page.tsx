import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import LeadsView from "@/components/leads/LeadsView";

export const dynamic = "force-dynamic";

export default async function AppLeadsPage() {
  const user = (await getSession())!;
  return (
    <>
      <PageHeader title="לידים" subtitle="כל הלידים שלך — סינון, טיפול וייצוא" />
      <LeadsView clientId={user.clientId!} />
    </>
  );
}
