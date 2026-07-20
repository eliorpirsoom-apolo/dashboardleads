import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ProjectsView from "@/components/projects/ProjectsView";

export const dynamic = "force-dynamic";

export default async function AppProjectsPage() {
  const user = (await getSession())!;
  const client = await prisma.client.findUnique({
    where: { id: user.clientId! },
    select: { type: true },
  });
  const isRealestate = client?.type === "realestate";
  return (
    <>
      <PageHeader
        title="פרויקטים"
        subtitle={
          isRealestate
            ? "הקמת פרויקט, מלאי דירות, מחירים וחוזים"
            : "לכל פרויקט מקורות קליטה, אנשי מכירות ולידים משלו"
        }
      />
      <ProjectsView
        clientId={user.clientId!}
        baseHref="/app/projects"
        isRealestate={isRealestate}
      />
    </>
  );
}
