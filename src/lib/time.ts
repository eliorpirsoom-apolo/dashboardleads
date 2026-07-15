// ---------------------------------------------------------------------------
// Israel-timezone helpers. The server runs in UTC (Vercel), so every
// "today" / "this month" boundary must be computed in Asia/Jerusalem
// explicitly — otherwise evening hours drift into the wrong day.
// ---------------------------------------------------------------------------

export const IL_TZ = "Asia/Jerusalem";

/** Date parts of `d` as seen in Israel. */
function ilParts(d: Date): { y: number; m: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: IL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, day] = fmt.format(d).split("-").map(Number);
  return { y, m, day };
}

/** UTC offset (ms) of Israel at the given instant (handles DST). */
function ilOffsetMs(d: Date): number {
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const il = new Date(d.toLocaleString("en-US", { timeZone: IL_TZ }));
  return il.getTime() - utc.getTime();
}

/** Start of the Israeli calendar day containing `now` (as a UTC instant). */
export function ilDayStart(now = new Date()): Date {
  const { y, m, day } = ilParts(now);
  const utcMidnight = Date.UTC(y, m - 1, day);
  return new Date(utcMidnight - ilOffsetMs(now));
}

export function ilDayEnd(now = new Date()): Date {
  return new Date(ilDayStart(now).getTime() + 24 * 60 * 60 * 1000);
}

/** Start of the Israeli calendar month containing `now`. */
export function ilMonthStart(now = new Date()): Date {
  const { y, m } = ilParts(now);
  const utcFirst = Date.UTC(y, m - 1, 1);
  return new Date(utcFirst - ilOffsetMs(now));
}

/** "2026-07" for the Israeli month containing `now`. */
export function ilMonthKey(now = new Date()): string {
  const { y, m } = ilParts(now);
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** "2026-07-15" for the Israeli day containing `now`. */
export function ilDateKey(now = new Date()): string {
  const { y, m, day } = ilParts(now);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
