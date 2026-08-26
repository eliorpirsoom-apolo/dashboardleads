"use client";

// בורר עם חיפוש (קומבו-בוקס): מקלידים כדי לסנן את הרשימה ובוחרים בלחיצה.
// לרשימות ארוכות (לקוחות וכו') שבהן גלילה לפי א-ב מציקה.

import { useEffect, useRef, useState } from "react";
import { inputCls } from "./ui";

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "חיפוש…",
  required,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  options: { id: string; name: string }[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value) ?? null;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const matches = q.trim()
    ? options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()))
    : options;

  return (
    <div ref={wrap} className="relative">
      <input
        value={open ? q : selected?.name ?? ""}
        onChange={(e) => {
          setQ(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQ("");
        }}
        placeholder={selected ? selected.name : placeholder}
        required={required && !value}
        className={className ?? inputCls}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQ("");
          }}
          title="ניקוי הבחירה"
          className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-rose-500"
        >
          ×
        </button>
      ) : null}
      {open ? (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {matches.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.id);
                setOpen(false);
                setQ("");
              }}
              className={`block w-full px-3 py-1.5 text-right text-sm transition hover:bg-slate-50 ${
                o.id === value ? "font-bold text-[#3a5bd9]" : "text-slate-700"
              }`}
            >
              {o.name}
            </button>
          ))}
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">אין תוצאות</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
