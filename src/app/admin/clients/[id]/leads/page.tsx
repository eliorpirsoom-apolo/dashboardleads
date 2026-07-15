import { getSession } from "@/lib/auth";
import LeadsView from "@/components/leads/LeadsView";

export const dynamic = "force-dynamic";

export default async function ClientLeadsPage({ params }: { params: { id: string } }) {
  const user = (await getSession())!;
  // CSV import is agency-manager-only (approved decision 3).
  return <LeadsView clientId={params.id} canImport={user.adminRole !== "staff"} />;
}
