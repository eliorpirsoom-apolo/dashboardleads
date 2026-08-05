import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import SeoView from "@/components/seo/SeoView";

export const dynamic = "force-dynamic";

export default async function AppSeoPage() {
  const user = (await getSession())!;
  if (user.isAgent) redirect("/app"); // משווק — גישה מוגבלת ללידים ולפרויקטים שלו
  return (
    <>
      <PageHeader
        title="SEO"
        subtitle="תנועה, מיקומים בגוגל ולידים אורגניים — מתעדכן יומית"
      />
      <SeoView clientId={user.clientId!} isAdmin={false} />
    </>
  );
}
