import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ReportsView from "@/components/reports/ReportsView";

export const dynamic = "force-dynamic";

export default async function AdminClientReportsPage({
  params,
}: {
  params: { id: string };
}) {
  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) notFound();

  return (
    <ReportsView clientId={client.id} isRealestate={client.type === "realestate"} />
  );
}
