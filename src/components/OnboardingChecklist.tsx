"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "./Icon";

// "צעדים ראשונים" ללקוח חדש — מוצג עד שיש דאטה, ניתן לסגירה (localStorage).
export default function OnboardingChecklist({
  hasSource,
  hasAgent,
  hasLead,
}: {
  hasSource: boolean;
  hasAgent: boolean;
  hasLead: boolean;
}) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem("onboarding_dismissed") === "1");
  }, []);

  if (dismissed) return null;

  const steps = [
    {
      done: true,
      label: "החשבון הוקם",
      hint: "",
      href: null as string | null,
    },
    {
      done: hasSource,
      label: "חיבור מקור לידים",
      hint: "המשרד מחבר את הטפסים והקמפיינים שלכם — דברו איתנו",
      href: null,
    },
    {
      done: hasAgent,
      label: "הוספת סוכן מכירות",
      hint: "המשרד יוסיף עבורכם משתמש לכל סוכן",
      href: null,
    },
    {
      done: hasLead,
      label: "הליד הראשון נכנס",
      hint: "ברגע שהקליטה מחוברת — הלידים יופיעו כאן אוטומטית",
      href: "/app/leads",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="mb-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-cyan-700">
          🚀 צעדים ראשונים ({doneCount}/{steps.length})
        </h2>
        <button
          onClick={() => {
            localStorage.setItem("onboarding_dismissed", "1");
            setDismissed(true);
          }}
          className="rounded p-1 text-slate-500 hover:text-slate-600"
          title="הסתרה"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                s.done
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                  : "border-slate-600 text-transparent"
              }`}
            >
              <Icon name="check" className="h-3 w-3" />
            </span>
            <span className={s.done ? "text-slate-400 line-through" : "text-slate-700"}>
              {s.href && !s.done ? (
                <Link href={s.href} className="hover:text-cyan-700">{s.label}</Link>
              ) : (
                s.label
              )}
            </span>
            {!s.done && s.hint ? (
              <span className="text-xs text-slate-500">— {s.hint}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
