import { PageHeader } from "@/components/ui";
import { requireAdminModule } from "@/lib/adminModules";
import AdminSettingsView from "./AdminSettingsView";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdminModule("settings");
  return (
    <>
      <PageHeader
        title="הגדרות המשרד"
        subtitle="סטטוס חיבורים חיצוניים ומשתמשי משרד"
      />
      <AdminSettingsView />
    </>
  );
}
