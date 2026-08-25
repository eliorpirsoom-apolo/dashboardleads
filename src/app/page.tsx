import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// דף הבית הציבורי — דרישת אימות ה-OAuth של גוגל: דף שמסביר את מטרת
// האפליקציה ונושא את השם "Apollo CRM" בדיוק כמו במסך ההסכמה.
// משתמשים מחוברים ממשיכים להיות מנותבים ישר לצד שלהם.

export const metadata: Metadata = {
  title: "Apollo CRM — מערכת ניהול לקוחות ולידים",
  description:
    "Apollo CRM היא מערכת לניהול לקוחות, לידים, קמפיינים ומשימות עבור סוכנות הפרסום אפולו והלקוחות שלה.",
};

export default async function Home() {
  const user = await getSession();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/app");

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-16">
        <header className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#3a5bd9] text-3xl text-white">
            🚀
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900">Apollo CRM</h1>
          <p className="max-w-xl text-lg text-slate-600">
            מערכת ניהול לקוחות, לידים וקמפיינים של סוכנות הפרסום{" "}
            <span className="font-semibold">אפולו פרסום</span> — פלטפורמה אחת שבה
            הסוכנות והלקוחות שלה עוקבים אחרי פניות, שיחות, משימות ותוצאות שיווק.
          </p>
          <Link
            href="/login"
            className="rounded-xl bg-[#3a5bd9] px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            כניסה למערכת
          </Link>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-xl font-bold text-slate-900">מה המערכת עושה?</h2>
          <ul className="flex list-disc flex-col gap-2 pr-5 text-slate-600">
            <li>קליטת לידים אוטומטית מדפי נחיתה, טפסי פייסבוק ושיחות טלפון — למקום אחד.</li>
            <li>ניהול סטטוסים, משימות ותזכורות לצוותי המכירות של לקוחות הסוכנות.</li>
            <li>לוח סטודיו לניהול משימות עיצוב, כולל אישורי לקוח מקוונים.</li>
            <li>דוחות קידום אורגני וקמפיינים ללקוחות הסוכנות.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-xl font-bold text-slate-900">
            שימוש בנתוני Google
          </h2>
          <p className="mb-2 text-slate-600">
            Apollo CRM מתחברת לשירותי Google רק לאחר הסכמה מפורשת של המשתמש/ת, ורק
            לצרכים הבאים:
          </p>
          <ul className="flex list-disc flex-col gap-2 pr-5 text-slate-600">
            <li>
              <span className="font-medium">יומן Google</span> — יצירה ועדכון של אירועי
              פגישות ומשימות ביומן האישי של אנשי הצוות שבחרו לחבר את היומן שלהם.
            </li>
            <li>
              <span className="font-medium">Search Console ו-Google Analytics</span> —
              קריאה בלבד, להצגת דוחות קידום אתרים ללקוחות שחיברו את הנכסים שלהם.
            </li>
          </ul>
          <p className="mt-3 text-sm text-slate-500">
            הנתונים אינם נמכרים ואינם מועברים לגורם שלישי. פירוט מלא במדיניות
            הפרטיות, וניתן לבקש מחיקת נתונים בכל עת.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          <p lang="en" dir="ltr">
            <strong>Apollo CRM</strong> is the client &amp; lead management platform of
            Apollo Advertising (אפולו פרסום). Agency staff and their clients use it to
            track marketing leads, calls, design tasks and campaign results. Google
            integrations (Calendar; read-only Search Console &amp; Analytics) are
            connected only with each user&apos;s explicit consent and are used solely to
            provide the features described above.
          </p>
        </section>

        <footer className="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-500">
          <Link href="/privacy" className="hover:text-[#3a5bd9] hover:underline">
            מדיניות פרטיות
          </Link>
          <span>·</span>
          <Link href="/data-deletion" className="hover:text-[#3a5bd9] hover:underline">
            בקשת מחיקת נתונים
          </Link>
          <span>·</span>
          <a href="mailto:eliorbucris@gmail.com" className="hover:text-[#3a5bd9] hover:underline">
            יצירת קשר: eliorbucris@gmail.com
          </a>
        </footer>
      </div>
    </main>
  );
}
