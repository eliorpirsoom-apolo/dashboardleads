import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ProjectDetail from "@/components/projects/ProjectDetail";

export const dynamic = "force-dynamic";

export default async function AdminProjectPage({
  params,
}: {
  params: { id: string; projectId: string };
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    include: { client: { select: { type: true } } },
  });
  if (!project || project.clientId !== params.id) notFound();

  return (
    <>
      <h2 className="mb-4 text-lg font-bold text-slate-100">{project.name}</h2>
      <ProjectDetail
        projectId={project.id}
        clientId={params.id}
        isRealestate={project.client.type === "realestate"}
      />
    </>
  );
}
