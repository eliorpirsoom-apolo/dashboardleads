import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import StudioBoard from "@/components/studio/StudioBoard";

export const dynamic = "force-dynamic";

// מודול סטודיו — צד משרד. מבריף ועד אישור סופי.
export default async function StudioPage() {
  const [clients, designers] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="סטודיו"
        subtitle="מבריף ועד אישור סופי — תזמון בין המעצבות, אישורי לקוח ובקרת איכות"
      />
      <StudioBoard clients={clients} designers={designers} />
    </>
  );
}
