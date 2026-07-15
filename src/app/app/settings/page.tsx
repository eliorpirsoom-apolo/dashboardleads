import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import StatusEditor from "@/components/settings/StatusEditor";
import CustomFieldsEditor from "@/components/settings/CustomFieldsEditor";
import AutomationsManager from "@/components/settings/AutomationsManager";

export const dynamic = "force-dynamic";

// Client self-service settings: statuses, custom fields, automations.
// Owners only — sales agents work, owners configure.
export default async function AppSettingsPage() {
  const user = (await getSession())!;
  if (user.isAgent) redirect("/app");
  return (
    <>
      <PageHeader
        title="הגדרות"
        subtitle="סטטוסים, שדות מותאמים והודעות אוטומטיות — בשליטה שלך"
      />
      <div className="flex flex-col gap-4">
        <StatusEditor clientId={user.clientId!} />
        <CustomFieldsEditor clientId={user.clientId!} />
        <AutomationsManager clientId={user.clientId!} />
      </div>
    </>
  );
}
