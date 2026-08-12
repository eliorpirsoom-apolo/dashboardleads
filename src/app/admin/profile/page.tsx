import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ProfileView from "@/components/ProfileView";

export const dynamic = "force-dynamic";

export default async function AdminProfilePage() {
  const user = (await getSession())!;
  const [dbUser, calConn] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    prisma.calendarConnection.findUnique({ where: { userId: user.id } }),
  ]);
  return (
    <>
      <PageHeader title="החשבון שלי" subtitle="פרטים אישיים, סיסמה, יומן Google ואבטחה" />
      <ProfileView
        initialName={dbUser?.name ?? ""}
        initialPhone={dbUser?.phone ?? ""}
        initialBirthday={dbUser?.birthday ? dbUser.birthday.toISOString().slice(0, 10) : ""}
        email={dbUser?.email ?? ""}
        hasPassword={Boolean(dbUser?.passwordHash)}
        calendar={{ connected: Boolean(calConn?.active), email: calConn?.googleEmail ?? null }}
      />
    </>
  );
}
