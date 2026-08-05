import { PageHeader } from "@/components/ui";
import { requireAdminModule } from "@/lib/adminModules";
import PaymentsBoard from "@/components/payments/PaymentsBoard";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  await requireAdminModule("payments");
  return (
    <>
      <PageHeader title="תשלומים" subtitle="לוח תזרים — סכומי תשלום וסטטוס לכל לקוח, לפי חודש" />
      <PaymentsBoard />
    </>
  );
}
