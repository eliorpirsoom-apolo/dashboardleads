import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import ProjectsView from "@/components/projects/ProjectsView";

export const dynamic = "force-dynamic";

export default async function AppProjectsPage() {
  const user = (await getSession())!;
  return (
    <>
      <PageHeader
        title="פרויקטים"
        subtitle="הקמת פרויקט, מלאי דירות, מחירים וחוזים"
      />
      <ProjectsView clientId={user.clientId!} baseHref="/app/projects" />
    </>
  );
}
