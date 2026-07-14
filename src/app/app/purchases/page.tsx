import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import PurchasesView from "@/components/projects/PurchasesView";

export const dynamic = "force-dynamic";

export default async function AppPurchasesPage() {
  const user = (await getSession())!;
  return (
    <>
      <PageHeader title="בקשות רכישה" subtitle="מעקב וניהול בקשות רכישה מלידים" />
      <PurchasesView clientId={user.clientId!} />
    </>
  );
}
