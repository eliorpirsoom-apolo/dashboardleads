import Link from "next/link";

export const metadata = {
  title: "מדיניות פרטיות — Apollo CRM",
  description: "מדיניות הפרטיות של מערכת Apollo CRM, כולל אופן השימוש בנתוני Google.",
};

// עמוד ציבורי (ללא התחברות) — נדרש לאימות אפליקציית ה-OAuth מול Google.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10" dir="rtl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/apollo-logo.png" alt="Apollo" className="mb-6 h-8 w-auto" />
      <h1 className="mb-1 text-2xl font-bold text-slate-800">מדיניות פרטיות</h1>
      <p className="mb-8 text-sm text-slate-500">Apollo CRM · app.apolloadv.co.il · עדכון אחרון: אוגוסט 2026</p>

      <section className="flex flex-col gap-6 text-sm leading-6 text-slate-700">
        <div>
          <h2 className="mb-1 text-base font-bold text-slate-800">מי אנחנו</h2>
          <p>
            Apollo CRM היא מערכת ניהול פנימית של משרד הפרסום אפולו (apolloadv.co.il),
            המשמשת את צוות המשרד ואת לקוחותיו לניהול לידים, פרויקטים, משימות, מסמכים
            ופעילות שיווקית. הגישה למערכת מוגבלת למשתמשים מורשים בלבד.
          </p>
        </div>

        <div>
          <h2 className="mb-1 text-base font-bold text-slate-800">איזה מידע נשמר במערכת</h2>
          <p>
            פרטי משתמשים מורשים (שם, אימייל, טלפון), נתוני לקוחות ולידים שנמסרו למשרד
            לצורך מתן השירות, מסמכים שהועלו על-ידי משתמשים, ותיעוד פעילות במערכת.
            המידע נשמר במסדי נתונים מאובטחים ואינו נמכר או מועבר לצדדים שלישיים,
            למעט ספקי תשתית החיוניים להפעלת השירות.
          </p>
        </div>

        <div>
          <h2 className="mb-1 text-base font-bold text-slate-800">שימוש בנתוני Google</h2>
          <p className="mb-2">
            המערכת מתחברת לשירותי Google רק לאחר הסכמה מפורשת של המשתמש (OAuth),
            ומבקשת אך ורק את ההרשאות הדרושות לתפקודה:
          </p>
          <ul className="mb-2 flex list-disc flex-col gap-1 pr-5">
            <li>
              <b>כניסה עם Google</b> (שם וכתובת אימייל) — לזיהוי משתמשים מורשים בכניסה למערכת.
            </li>
            <li>
              <b>יומן Google</b> — להצגת יומני העבודה של חברי הצוות בתוך המערכת וליצירה/עדכון
              של אירועים עבור פגישות ומשימות שנקבעו במערכת. המערכת אינה משנה או מוחקת
              אירועים שלא נוצרו על-ידה.
            </li>
            <li>
              <b>Google Search Console</b> (קריאה בלבד) — להצגת נתוני ביצועים אורגניים של
              אתרי לקוחות בדוחות ה-SEO.
            </li>
            <li>
              <b>Google Analytics</b> (קריאה בלבד) — להצגת נתוני תנועה של אתרי לקוחות בדוחות.
            </li>
          </ul>
          <p className="mb-2">
            אסימוני הגישה (Tokens) נשמרים מוצפנים במסד הנתונים ומשמשים אך ורק לפעולות
            שתוארו לעיל. נתוני Google אינם נמכרים, אינם משמשים לפרסום, ואינם מועברים
            לגורם שלישי. גישת עובדים לנתונים מתקיימת רק לצורך תפעול ותמיכה.
          </p>
          <p>
            ניתן לנתק את החיבור בכל עת מתוך המערכת (עמוד ״החשבון שלי״ או הגדרות החיבורים)
            או דרך{" "}
            <a
              href="https://myaccount.google.com/permissions"
              className="text-[#3a5bd9] underline"
              target="_blank"
              rel="noreferrer"
            >
              הגדרות האבטחה של חשבון Google
            </a>
            . עם הניתוק נמחקים אסימוני הגישה; ניתן לבקש מחיקת נתונים נוספים בפנייה אלינו.
          </p>
        </div>

        <div>
          <h2 className="mb-1 text-base font-bold text-slate-800">Google API Limited Use Disclosure</h2>
          <p dir="ltr" className="text-left">
            Apollo CRM&apos;s use and transfer to any other app of information received from
            Google APIs will adhere to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="text-[#3a5bd9] underline"
              target="_blank"
              rel="noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. Google user data is used only to
            provide the in-app features described above (team calendar display, two-way
            event sync for meetings and tasks, and read-only SEO/analytics reporting),
            is never sold, never used for advertising, and never transferred to third
            parties except as necessary to operate the service.
          </p>
        </div>

        <div>
          <h2 className="mb-1 text-base font-bold text-slate-800">שימוש בנתוני Meta (פייסבוק)</h2>
          <p className="mb-2">
            עבור לקוחות עסקיים שחיברו את עמוד הפייסבוק שלהם למערכת, Apollo CRM ניגשת
            באמצעות הרשאה מפורשת (OAuth) לנתוני טפסי הלידים של העמוד (Lead Ads) —
            אך ורק כדי להעביר את פרטי הלידים (שם, טלפון, אימייל ופרטי ההתעניינות
            שנמסרו בטופס) אל מערכת ניהול הלקוחות של בית העסק שאליו פנה הליד.
          </p>
          <p>
            נתוני Meta אינם נמכרים, אינם משמשים לפרסום ואינם מועברים לגורם שלישי
            מלבד בית העסק הרלוונטי. ניתן לנתק את חיבור העמוד בכל עת מתוך המערכת,
            ולבקש מחיקת נתונים לפי{" "}
            <Link href="/data-deletion" className="text-[#3a5bd9] underline">
              הוראות מחיקת הנתונים
            </Link>
            .
          </p>
        </div>

        <div>
          <h2 className="mb-1 text-base font-bold text-slate-800">אבטחת מידע</h2>
          <p>
            התקשורת עם המערכת מוצפנת (HTTPS), הגישה מוגנת בהרשאות לפי תפקיד, קבצים
            נשמרים באחסון מאובטח עם קישורי גישה זמניים, ופעולות רגישות מתועדות ביומן
            ביקורת.
          </p>
        </div>

        <div>
          <h2 className="mb-1 text-base font-bold text-slate-800">יצירת קשר</h2>
          <p>
            לשאלות, בקשות עיון או מחיקת מידע:{" "}
            <a href="mailto:eliorbucris@gmail.com" className="text-[#3a5bd9] underline">
              eliorbucris@gmail.com
            </a>
          </p>
        </div>
      </section>

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">
        <Link href="/login" className="hover:text-slate-600">← חזרה לכניסה למערכת</Link>
      </footer>
    </main>
  );
}
