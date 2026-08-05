import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireAdminModule } from "@/lib/adminModules";
import AdminDocumentsCenter from "./AdminDocumentsCenter";

export const dynamic = "force-dynamic";

// Upload center: pick a client, manage its documents (receipts by month etc.).
export default async function AdminDocumentsPage() {
  await requireAdminModule("documents");
  const clients = await prisma.client.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        title="מרכז מסמכים"
        subtitle="העלאת הסכמים, חשבוניות וקבלות פייסבוק/גוגל ללקוחות — לפי חודשים"
      />
      <AdminDocumentsCenter clients={clients} />
    </>
  );
}
