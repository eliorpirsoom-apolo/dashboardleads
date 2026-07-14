import ProjectsView from "@/components/projects/ProjectsView";

export const dynamic = "force-dynamic";

export default function AdminClientProjectsPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <ProjectsView
      clientId={params.id}
      baseHref={`/admin/clients/${params.id}/projects`}
    />
  );
}
