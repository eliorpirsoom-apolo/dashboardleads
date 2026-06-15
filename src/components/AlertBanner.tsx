"use client";

import type { RegressionResult } from "@/lib/types";

// Prominent banner shown when one or more campaigns regress week-over-week.
export default function AlertBanner({
  flagged,
  threshold,
}: {
  flagged: RegressionResult[];
  threshold: number;
}) {
  if (flagged.length === 0) return null;

  return (
    <div className="animate-pulse-glow relative overflow-hidden rounded-2xl border border-red-500/40 bg-red-950/40 p-4 backdrop-blur-xl">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500 to-transparent" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="text-base font-semibold text-red-200">
              זוהתה ירידה בנפח הלידים
            </h3>
            <p className="text-sm text-red-300/90">
              {flagged.length} קמפיינים ירדו בלפחות {threshold}% מול השבוע הקודם.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {flagged.slice(0, 4).map((r) => (
            <span
              key={r.campaignId}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200 ring-1 ring-red-500/30"
            >
              {r.campaign}
              <span className="font-bold text-red-300">{r.dropPercent}%-</span>
            </span>
          ))}
          {flagged.length > 4 && (
            <span className="inline-flex items-center rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200 ring-1 ring-red-500/30">
              ועוד {flagged.length - 4}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
