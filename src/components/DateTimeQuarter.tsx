"use client";

// בורר תאריך+שעה בסגנון Google Calendar — שדה תאריך לצד רשימת שעות נפתחת
// ברבעי שעה (12:00, 12:15, 12:30…). value בפורמט datetime-local
// ("YYYY-MM-DDTHH:mm") או "" — תואם אחד-לאחד לשדה datetime-local שהוחלף.
// בחירת תאריך לפני שעה משלימה את רבע השעה הקרוב; שעה לפני תאריך — היום.

import { inputCls } from "./ui";

const QUARTER_TIMES = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return `${h}:${m}`;
});

function nextQuarterNow(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + ((15 - (d.getMinutes() % 15)) % 15));
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DateTimeQuarter({
  value,
  onChange,
  className,
  required,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  /** מחליף את עיצוב ברירת המחדל של שני השדות (לשורות טבלה צפופות) */
  className?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const date = value ? value.slice(0, 10) : "";
  const time = value ? value.slice(11, 16) : "";
  const cls = className ?? inputCls;

  return (
    // min-w-0 + flex-1 על התאריך: הזוג מתכווץ לרוחב התא ולא גולש על עמודות שכנות.
    <span dir="ltr" className="flex w-full min-w-0 items-center gap-1">
      <input
        type="date"
        value={date}
        required={required}
        disabled={disabled}
        onChange={(e) => {
          const d = e.target.value;
          if (!d) onChange("");
          else onChange(`${d}T${time || nextQuarterNow()}`);
        }}
        className={`${cls} min-w-0 flex-1`}
      />
      <select
        dir="ltr"
        value={time}
        required={required}
        disabled={disabled}
        onChange={(e) => {
          const t = e.target.value;
          if (t) onChange(`${date || todayStr()}T${t}`);
        }}
        className={`${cls} !w-auto shrink-0 !px-1.5`}
      >
        <option value="" disabled>
          שעה
        </option>
        {time && !QUARTER_TIMES.includes(time) ? <option value={time}>{time}</option> : null}
        {QUARTER_TIMES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </span>
  );
}
