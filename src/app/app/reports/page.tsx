import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ReportsView from "@/components/reports/ReportsView";

export const dynamic = "force-dynamic";

export default async function AppReportsPage() {
  const user = (await getSession())!;
  const client = await prisma.client.findUnique({ where: { id: user.clientId! } });
  return (
    <>
      <PageHeader
        title="דוחות"
        subtitle="לידים, עלות לליד, תקציב מול ביצוע וערך חוזים — לפי תקופה"
      />
      <ReportsView
        clientId={user.clientId!}
        isRealestate={client?.type === "realestate"}
      />
    </>
  );
}
