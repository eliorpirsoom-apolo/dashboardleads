import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ProjectDetail from "@/components/projects/ProjectDetail";
import { allowedProjectIds, projectAllowed } from "@/lib/projectScope";

export const dynamic = "force-dynamic";

export default async function AppProjectPage({
  params,
}: {
  params: { id: string };
}) {
  const user = (await getSession())!;
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { client: { select: { type: true } } },
  });
  if (!project || project.clientId !== user.clientId) notFound();
  // משווק ניגש רק לפרויקטים המשויכים אליו (owner/agency = ללא הגבלה).
  const allowed = await allowedProjectIds(user);
  if (!projectAllowed(allowed, project.id)) notFound();

  return (
    <>
      <PageHeader title={project.name} subtitle={project.description ?? undefined} />
      <ProjectDetail
        projectId={project.id}
        clientId={user.clientId!}
        isRealestate={project.client.type === "realestate"}
      />
    </>
  );
}
