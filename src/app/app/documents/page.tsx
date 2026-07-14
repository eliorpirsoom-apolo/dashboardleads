import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import DocumentsView from "@/components/documents/DocumentsView";

export const dynamic = "force-dynamic";

export default async function AppDocumentsPage() {
  const user = (await getSession())!;
  return (
    <>
      <PageHeader
        title="מסמכים"
        subtitle="הסכם העבודה, חשבוניות וקבלות פייסבוק/גוגל — לפי חודשים"
      />
      <DocumentsView clientId={user.clientId!} canUpload canDelete />
    </>
  );
}
