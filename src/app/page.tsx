import DashboardClient from "@/components/DashboardClient";

// The page itself is a thin server component; all interactivity (filters,
// data fetching) lives in the client dashboard.
export default function Page() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <DashboardClient />
    </main>
  );
}
