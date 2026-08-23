import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import HealthView from "@/components/health/HealthView";

export const dynamic = "force-dynamic";

// בריאות מערכת — מנהלים בלבד.
export default async function HealthPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" || user.adminRole === "staff") redirect("/admin");
  return <HealthView />;
}
