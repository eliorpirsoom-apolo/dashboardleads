// עמוד ציבורי — נדרש ע"י Meta (User Data Deletion Instructions URL).
export const metadata = { title: "מחיקת נתונים — Apollo CRM" };

export default function DataDeletionPage() {
  return (
    <main dir="rtl" className="mx-auto max-w-2xl px-6 py-12 text-slate-800">
      <h1 className="mb-2 text-2xl font-bold">הוראות מחיקת נתונים — Apollo CRM</h1>
      <p className="mb-8 text-sm text-slate-500">Data Deletion Instructions</p>

      <section className="flex flex-col gap-5 text-sm leading-6">
        <p>
          אם פניתם לאחד מבתי העסק המשתמשים ב-Apollo CRM (למשל דרך טופס לידים
          בפייסבוק או באתר) וברצונכם שפרטיכם יימחקו מהמערכת — שלחו בקשה לכתובת:
        </p>
        <p className="rounded-xl bg-slate-100 px-4 py-3 font-medium" dir="ltr">
          eliorbucris@gmail.com
        </p>
        <p>
          בבקשה ציינו את מספר הטלפון או כתובת האימייל שמסרתם. הבקשה תטופל
          ותושלם בתוך 30 יום, ותקבלו אישור על השלמת המחיקה. המחיקה כוללת את כל
          פרטי הליד, ההתכתבויות וההקלטות המשויכות.
        </p>
        <p className="text-slate-500">
          To request deletion of your personal data from Apollo CRM, email
          eliorbucris@gmail.com with the phone number or email address you
          provided. Deletion is completed within 30 days with confirmation.
        </p>
      </section>
    </main>
  );
}
