import { PageHeader } from "@/components/ui";
import QuotesView from "@/components/quotes/QuotesView";

export const dynamic = "force-dynamic";

export default function AdminQuotesPage() {
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
