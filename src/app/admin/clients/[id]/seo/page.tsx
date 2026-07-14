import SeoView from "@/components/seo/SeoView";

export const dynamic = "force-dynamic";

export default function AdminClientSeoPage({
  params,
}: {
  params: { id: string };
}) {
  return <SeoView clientId={params.id} isAdmin />;
}
