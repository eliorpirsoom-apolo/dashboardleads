import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Role router: each user lands on their own side of the system.
export default async function Home() {
  const user = await getSession();
  if (!user) redirect("/login");
  redirect(user.role === "ADMIN" ? "/admin" : "/app");
}
