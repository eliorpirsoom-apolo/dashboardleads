import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import FeedbackInbox from "@/components/feedback/FeedbackInbox";

export const dynamic = "force-dynamic";

// תיבת המשוב — מנהל משרד בלבד.
export default async function AdminFeedbackPage() {
  const user = (await getSession())!;
  if (user.adminRole !== "manager") redirect("/admin");
  return (
    <>
      <PageHeader title="משוב" subtitle="הערות, תקלות ורעיונות מהצוות על המערכת" />
      <FeedbackInbox />
    </>
  );
}
