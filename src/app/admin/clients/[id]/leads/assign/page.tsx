import { PageHeader, Button } from "@/components/ui";
import { requireAdminModule } from "@/lib/adminModules";
import AssignLeadsPanel from "@/components/leads/AssignLeadsPanel";

export const dynamic = "force-dynamic";

// שיוך המוני של לידים (אחרי ייבוא) לפרויקט ולמשווק — לחיצה אחת של המשרד.
export default async function AssignLeadsPage({ params }: { params: { id: string } }) {
  await requireAdminModule("clients");
  return (
    <>
      <PageHeader
        title="שיוך לידים לפרויקט ולמטפל"
        subtitle="לידים שנכנסו בלי פרויקט (למשל מייבוא קובץ) לא מוצגים לסוכן — כאן משייכים אותם בבת אחת"
        actions={
          <a href={`/admin/clients/${params.id}/leads`}>
            <Button variant="ghost" type="button">חזרה ללידים</Button>
          </a>
        }
      />
      <AssignLeadsPanel clientId={params.id} />
    </>
  );
}
