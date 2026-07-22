import { prisma } from "@/lib/prisma";
import { ilDayStart } from "@/lib/time";
import { wonDeals } from "@/lib/wins";

// ---------------------------------------------------------------------------
// באנרים חגיגיים בצד המשרד (בנוסף לבאנר ימי ההולדת):
//   🔥 עסקאות שנסגרו היום   ·   🌇 שישי שמח
// ---------------------------------------------------------------------------

function ilWeekday(d: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
  }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** 🔥 נסגרה עסקה היום — מוצג בכל צד המשרד עד סוף היום. */
export async function WinsTodayBanner() {
  const now = new Date();
  const deals = await wonDeals(ilDayStart(now), now);
  if (deals.length === 0) return null;

  const label = (d: (typeof deals)[number]) =>
    `${d.fullName ?? `ליד #${d.number}`} (${d.projectName ?? d.clientName})`;
  const shown = deals.slice(0, 3).map(label).join(" · ");
  const extra = deals.length > 3 ? ` ועוד ${deals.length - 3}` : "";
  const text =
    deals.length === 1
      ? `נסגרה עסקה היום: ${shown} — כל הכבוד!`
      : `נסגרו ${deals.length} עסקאות היום: ${shown}${extra} — כל הכבוד!`;

  return (
    <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-gradient-to-l from-emerald-500/15 via-cyan-500/10 to-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 shadow-[0_0_20px_rgba(52,211,153,0.15)]">
      <span aria-hidden>🔥</span>
      {text}
      <span aria-hidden>🎉</span>
    </div>
  );
}

/** 🌇 שישי שמח — כל יום שישי (לוח ישראל). */
export async function FridayBanner() {
  if (ilWeekday(new Date()) !== 5) return null;

  // שקט ביום שישי אם אין בכלל משתמשי משרד (התקנה טרייה).
  const admins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
  if (admins === 0) return null;

  return (
    <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl border border-sky-400/30 bg-gradient-to-l from-sky-500/15 via-violet-500/10 to-amber-500/15 px-4 py-2.5 text-sm font-semibold text-sky-200">
      <span aria-hidden>🌇</span>
      שישי שמח! שבת שלום וסוף שבוע נעים לצוות אפולו
      <span aria-hidden>🕯️</span>
    </div>
  );
}
