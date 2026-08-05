import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { requireAdminModule } from "@/lib/adminModules";
import StudioBoard from "@/components/studio/StudioBoard";

export const dynamic = "force-dynamic";

// מודול סטודיו — צד משרד. מבריף ועד אישור סופי.
export default async function StudioPage() {
  await requireAdminModule("studio");
  const me = await getSession();
  const [clients, designers] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { id: true, name: true, calendarConnection: { select: { active: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const designerOpts = designers.map((d) => ({
    id: d.id,
    name: d.name,
    calendarConnected: !!d.calendarConnection?.active,
  }));

  return (
    <div className="theme-light -mx-4 -my-6 min-h-screen px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">סטודיו</h1>
        <p className="mt-1 text-sm text-slate-500">
          מבריף ועד אישור סופי — תזמון בין המעצבות, אישורי לקוח ובקרת איכות
        </p>
      </div>
      <StudioBoard clients={clients} designers={designerOpts} meId={me?.id ?? null} />
    </div>
  );
}
