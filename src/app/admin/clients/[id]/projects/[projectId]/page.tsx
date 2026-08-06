import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ProjectDetail from "@/components/projects/ProjectDetail";
import ProjectConnections from "@/components/projects/ProjectConnections";

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
      <h2 className="mb-4 text-lg font-bold text-slate-800">{project.name}</h2>
      <ProjectDetail
        projectId={project.id}
        clientId={params.id}
        isRealestate={project.client.type === "realestate"}
      />
      {/* חיבורי הפרויקט — צד משרד בלבד (טוקנים = סודות; לא ב-ProjectDetail המשותף) */}
      <div className="mt-4">
        <ProjectConnections clientId={params.id} projectId={project.id} />
      </div>
    </>
  );
}
