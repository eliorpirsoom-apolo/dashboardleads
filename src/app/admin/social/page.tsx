import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireAdminModule } from "@/lib/adminModules";
import SocialInbox from "@/components/social/SocialInbox";

export const dynamic = "force-dynamic";

// תיבת המענה החברתי (שלב 1a — קריאה בלבד): תגובות והודעות מדפי הפייסבוק
// והאינסטגרם של הלקוחות, לפי לקוח/פלטפורמה/סטטוס. מנהל תמיד; עובד — לפי הרשאה.
export default async function AdminSocialPage() {
  await requireAdminModule("social");
  const [clients, connected] = await Promise.all([
    prisma.client.findMany({
      where: { active: true, socialAccounts: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.socialAccount.count({ where: { active: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="תיבת מענה חברתי"
        subtitle="תגובות והודעות מדפי הפייסבוק והאינסטגרם של הלקוחות — נכנסות אוטומטית, נענות באישור אדם"
      />
      {connected === 0 ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          עדיין לא חובר אף דף לתיבה. מחברים דף מהגדרות הלקוח ← חיבורים ← &quot;תיבת מענה
          חברתי&quot;.{" "}
          <Link href="/admin/clients" className="font-medium underline">
            ללקוחות ←
          </Link>
        </p>
      ) : null}
      <SocialInbox clients={clients} />
    </>
  );
}
