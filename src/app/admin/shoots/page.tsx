import { prisma } from "@/lib/prisma";
import { requireAdminModule } from "@/lib/adminModules";
import ShootsBoard from "@/components/shoots/ShootsBoard";

export const dynamic = "force-dynamic";

// מודול ימי צילום — פנימי למשרד: תיאום, שיבוץ צוות וסטטוס ימי צילום.
export default async function ShootsPage() {
  const user = await requireAdminModule("shoots");
  const [clients, team] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <div className="theme-light -mx-4 -my-6 min-h-screen px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">🎬 ימי צילום</h1>
        <p className="mt-1 text-sm text-slate-500">
          תיאום, שיבוץ צוות וסטטוס של ימי הצילום — פנימי למשרד
        </p>
      </div>
      <ShootsBoard clients={clients} team={team} isManager={user.adminRole !== "staff"} />
    </div>
  );
}
