import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import MarketersManager from "@/components/marketers/MarketersManager";

export const dynamic = "force-dynamic";

// ניהול משווקים — בעל-הכרטיס בלבד. משווק (isAgent) מופנה החוצה.
export default async function MarketersPage() {
  const user = (await getSession())!;
  if (user.isAgent) redirect("/app");
  return (
    <>
      <PageHeader title="משווקים" subtitle="פתיחת משווקים, ניהול גישה ושיוך לפרויקטים" />
      <MarketersManager />
    </>
  );
}
