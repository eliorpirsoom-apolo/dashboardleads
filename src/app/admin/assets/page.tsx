import { PageHeader } from "@/components/ui";
import { requireAdminModule } from "@/lib/adminModules";
import AssetsBoard from "@/components/assets/AssetsBoard";

export const dynamic = "force-dynamic";

// 🗂 מרשם הנכסים הדיגיטליים — שליטה על ביזנס מנג'רים, דפים וחשבונות מודעות.
export default async function AdminAssetsPage() {
  await requireAdminModule("assets");
  return (
    <>
      <PageHeader
        title="נכסים דיגיטליים"
        subtitle="ביזנס מנג'רים · דפים · חשבונות מודעות — בבעלות מי, יש גישה, ודרך מי"
      />
      <AssetsBoard />
    </>
  );
}
