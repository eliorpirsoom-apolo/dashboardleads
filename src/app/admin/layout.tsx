import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { adminNavFor } from "@/lib/nav";
import Sidebar from "@/components/Sidebar";
import BirthdayBanner from "@/components/BirthdayBanner";
import { FridayBanner } from "@/components/FestiveBanners";
import Footer from "@/components/Footer";

export const dynamic = "force-dynamic";

// Agency side — ADMIN only. The layout is the security gate for every page
// beneath /admin; API routes enforce their own guards separately.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/app");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        items={adminNavFor(user)}
        userName={user.name}
        roleLabel={user.adminRole === "staff" ? "צד משרד · עובד" : "צד משרד · מנהל"}
        homeHref="/admin"
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <BirthdayBanner />
        <FridayBanner />
        {children}
        <Footer />
      </main>
    </div>
  );
}
