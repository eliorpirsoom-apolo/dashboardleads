import UnsubscribeForm from "./UnsubscribeForm";

export const dynamic = "force-dynamic";

// Public unsubscribe page — no login required (reached from email links).
export default function UnsubscribePage({
  searchParams,
}: {
  searchParams: { t?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="glass w-full max-w-md rounded-2xl p-8 text-center">
        <UnsubscribeForm token={searchParams.t ?? ""} />
      </div>
    </main>
  );
}
