import { prisma } from "@/lib/prisma";
import { requireAdminModule } from "@/lib/adminModules";
import OrganicBoard from "@/components/organic/OrganicBoard";

export const dynamic = "force-dynamic";

// מודול קידום אורגני — מעקב ביצועים ללקוחות SEO: לינקים, תכנים, אופטימיזציה.
export default async function OrganicPage() {
  const user = await requireAdminModule("organic");
  const users = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <div className="theme-light -mx-4 -my-6 min-h-screen px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">קידום אורגני</h1>
        <p className="mt-1 text-sm text-slate-500">
          מה בוצע לכל לקוח — לינקים, תכנים, אופטימיזציה ועדכוני אתר, מול המכסה החודשית
        </p>
      </div>
      <OrganicBoard users={users} isManager={user.adminRole !== "staff"} />
    </div>
  );
}
