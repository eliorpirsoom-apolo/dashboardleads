import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import MyPaymentsView from "@/components/payments/MyPaymentsView";

export const dynamic = "force-dynamic";

// תשלומים — צד לקוח, קריאה בלבד, בעל-הכרטיס בלבד (משווק חסום).
export default async function ClientPaymentsPage() {
  const user = (await getSession())!;
  if (user.isAgent) redirect("/app");
  return (
    <>
      <PageHeader title="תשלומים" subtitle="מצב התשלומים החודשיים והחד-פעמיים שלך" />
      <MyPaymentsView />
    </>
  );
}
