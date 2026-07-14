import { PageHeader } from "@/components/ui";
import AdminSettingsView from "./AdminSettingsView";

export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
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
