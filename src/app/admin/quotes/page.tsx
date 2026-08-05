import { PageHeader } from "@/components/ui";
import { requireAdminModule } from "@/lib/adminModules";
import QuotesView from "@/components/quotes/QuotesView";

export const dynamic = "force-dynamic";

export default async function AdminQuotesPage() {
  await requireAdminModule("quotes");
  return (
    <>
      <PageHeader
        title="הצעות מחיר"
        subtitle="כל הצעה במעקב עד שנסגרת — לחיוב או לשלילה"
      />
      <QuotesView />
    </>
  );
}
