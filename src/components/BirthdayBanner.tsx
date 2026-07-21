import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// "מזל טוב!" — באנר בצד המשרד בשבוע (ראשון–שבת, לוח ישראל) שבו לעובד
// יש יום הולדת. התאריך מוזן בפרופיל ("החשבון שלי").
// ---------------------------------------------------------------------------

/** "MM-DD" of a date in Israel time. */
function ilMonthDay(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}-${get("day")}`;
}

/** 0=Sunday..6=Saturday of "now" in Israel time. */
function ilWeekday(d: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
  }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

export default async function BirthdayBanner() {
  const users = await prisma.user.findMany({
    where: { role: "ADMIN", active: true, birthday: { not: null } },
    select: { name: true, birthday: true },
  });
  if (users.length === 0) return null;

  // ימי השבוע הנוכחי (ראשון–שבת) כ-"MM-DD".
  const now = new Date();
  const sunday = new Date(now.getTime() - ilWeekday(now) * 24 * 60 * 60 * 1000);
  const weekDays = new Set(
    Array.from({ length: 7 }, (_, i) =>
      ilMonthDay(new Date(sunday.getTime() + i * 24 * 60 * 60 * 1000))
    )
  );

  const celebrating = users.filter((u) => weekDays.has(ilMonthDay(u.birthday!)));
  if (celebrating.length === 0) return null;

  const names = celebrating.map((u) => u.name.split(" ")[0]);
  const text =
    names.length === 1
      ? `מזל טוב ל${names[0]} שחוגג/ת השבוע יום הולדת!`
      : `מזל טוב ל${names.slice(0, -1).join(", ל")} ול${names[names.length - 1]} שחוגגים השבוע יום הולדת!`;

  return (
    <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl border border-amber-400/30 bg-gradient-to-l from-amber-500/15 via-pink-500/15 to-violet-500/15 px-4 py-2.5 text-sm font-semibold text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
      <span aria-hidden>🎂</span>
      {text}
      <span aria-hidden>🎉</span>
    </div>
  );
}
