import SeoReportClient from "@/components/seo/SeoReportClient";

// Thin server component; the interactive organic-SEO report lives in the client.
export default function SeoPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <SeoReportClient />
    </main>
  );
}
