import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientNavFor } from "@/lib/nav";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

// Client side — CLIENT users only, hard-scoped to their own client.
// Navigation is filtered by the client's enabled modules (client type).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");
  if (!user.clientId) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="glass max-w-md rounded-2xl p-6 text-center">
          <p className="text-sm text-slate-300">
            המשתמש אינו משויך ללקוח. פנו למנהל המשרד.
          </p>
        </div>
      </main>
    );
  }

  const client = await prisma.client.findUnique({
    where: { id: user.clientId },
  });
  if (!client || !client.active) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="glass max-w-md rounded-2xl p-6 text-center">
          <p className="text-sm text-slate-300">
            החשבון אינו פעיל. פנו למנהל המשרד.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        items={clientNavFor(client.type, user.isAgent)}
        userName={user.name}
        roleLabel={user.isAgent ? `${client.name} · סוכן` : client.name}
        homeHref="/app"
        logoUrl={client.logoKey ? `/api/files/${client.logoKey}` : null}
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
