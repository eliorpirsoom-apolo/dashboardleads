import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import NotificationsView from "@/components/NotificationsView";

export const dynamic = "force-dynamic";

// עמוד ההתראות האישי — תיוגי @ ועדכונים. נגיש לכל משתמש משרד (לא מודול מוגבל).
export default async function NotificationsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/app");
  return (
    <div className="theme-light -mx-4 -my-6 min-h-screen px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">🔔 התראות</h1>
        <p className="mt-1 text-sm text-slate-500">תיוגים ועדכונים שממוענים אליך</p>
      </div>
      <NotificationsView />
    </div>
  );
}
