import { prisma } from "@/lib/prisma";
import ProjectsView from "@/components/projects/ProjectsView";

export const dynamic = "force-dynamic";

export default async function AdminClientProjectsPage({
  params,
}: {
  params: { id: string };
}) {
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    select: { type: true },
  });
  return (
    <ProjectsView
      clientId={params.id}
      baseHref={`/admin/clients/${params.id}/projects`}
      isRealestate={client?.type === "realestate"}
    />
  );
}
