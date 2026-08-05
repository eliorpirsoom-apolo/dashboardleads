import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import GanttBoard from "@/components/gantt/GanttBoard";

export const dynamic = "force-dynamic";

export default async function ClientGanttPage() {
  const user = (await getSession())!;
  if (user.isAgent) redirect("/app"); // משווק — גישה מוגבלת ללידים ולפרויקטים שלו
  return (
    <>
      <PageHeader title="תוכנית העבודה שלי" subtitle="גאנט חודשי — מה מבוצע בכל שבוע" />
      <GanttBoard clientId={user.clientId!} canEdit={false} />
    </>
  );
}
