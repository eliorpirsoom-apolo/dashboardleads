import DocumentsView from "@/components/documents/DocumentsView";

export const dynamic = "force-dynamic";

export default function ClientDocumentsPage({ params }: { params: { id: string } }) {
  return <DocumentsView clientId={params.id} canUpload canDelete />;
}
