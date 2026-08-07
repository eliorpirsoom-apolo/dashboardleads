import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// באנרים חגיגיים בצד המשרד (בנוסף לבאנר ימי ההולדת).
// עסקאות שנסגרו מוצגות בפאנל "עסקאות שנסגרו" בסקירה הכללית.
// ---------------------------------------------------------------------------

function ilWeekday(d: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
  }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** 🌇 שישי שמח — כל יום שישי (לוח ישראל). */
export async function FridayBanner() {
  if (ilWeekday(new Date()) !== 5) return null;

  // שקט ביום שישי אם אין בכלל משתמשי משרד (התקנה טרייה).
  const admins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
  if (admins === 0) return null;

  return (
    <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl border border-sky-400/30 bg-gradient-to-l from-sky-500/15 via-violet-500/10 to-amber-500/15 px-4 py-2.5 text-sm font-semibold text-sky-900">
      <span aria-hidden>🌇</span>
      שישי שמח! שבת שלום וסוף שבוע נעים לצוות אפולו
      <span aria-hidden>🕯️</span>
    </div>
  );
}
