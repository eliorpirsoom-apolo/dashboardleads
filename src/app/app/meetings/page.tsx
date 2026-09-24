import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import ClientMeetings from "@/components/meetings/ClientMeetings";

export const dynamic = "force-dynamic";

// צד לקוח — סיכומי הפגישות שנשלחו אליו (לקריאה בלבד).
export default async function AppMeetingsPage() {
  const user = (await getSession())!;
  if (user.isAgent) redirect("/app");
  return (
    <>
      <PageHeader title="סיכומי פגישות" subtitle="סיכומי הפגישות שקיבלתם מאיתנו" />
      <ClientMeetings />
    </>
  );
}
