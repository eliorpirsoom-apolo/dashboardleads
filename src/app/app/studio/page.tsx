import { PageHeader } from "@/components/ui";
import StudioApprovals from "@/components/studio/StudioApprovals";

export const dynamic = "force-dynamic";

// צד לקוח — אישור עיצובים ומתן פידבק.
export default function ClientStudioPage() {
  return (
    <>
      <PageHeader title="עיצובים לאישור" subtitle="צפייה בתוצרים, אישור או בקשת תיקונים" />
      <StudioApprovals />
    </>
  );
}
