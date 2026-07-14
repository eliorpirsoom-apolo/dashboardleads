import LeadsView from "@/components/leads/LeadsView";

export const dynamic = "force-dynamic";

export default function ClientLeadsPage({ params }: { params: { id: string } }) {
  return <LeadsView clientId={params.id} />;
}
