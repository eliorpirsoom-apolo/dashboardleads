"use client";

import type { UploadRow } from "@/lib/uploadWithProgress";

// חיווי העלאה: שורה לכל קובץ עם מד אחוזים אמיתי + מצב (מעלה/מסיים/הושלם/נכשל).
export default function UploadProgress({ rows }: { rows: UploadRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-2.5">
      {rows.map((r) => (
        <div key={r.id} className="text-xs">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-slate-600" title={r.name}>
              📎 {r.name}
            </span>
            <span
              className={
                r.status === "error"
                  ? "text-rose-500"
                  : r.status === "done"
                    ? "text-emerald-600"
                    : "text-slate-400"
              }
            >
              {r.status === "error"
                ? "נכשל ✗"
                : r.status === "done"
                  ? "הושלם ✓"
                  : r.status === "finalizing"
                    ? "מסיים…"
                    : `${r.pct}%`}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                r.status === "error"
                  ? "bg-rose-400"
                  : r.status === "done"
                    ? "bg-emerald-500"
                    : "bg-[#3a5bd9]"
              }`}
              style={{ width: `${r.status === "done" ? 100 : r.status === "finalizing" ? 100 : r.pct}%` }}
            />
          </div>
          {r.error ? <div className="mt-0.5 text-rose-500">{r.error}</div> : null}
        </div>
      ))}
    </div>
  );
}
