"use client";

import { Card } from "@tremor/react";
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
    <Card className="animate-pulse-glow border-l-4 border-red-500 bg-red-50 ring-1 ring-red-200">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="text-base font-semibold text-red-800">
              Lead volume regression detected
            </h3>
            <p className="text-sm text-red-700">
              {flagged.length} campaign{flagged.length > 1 ? "s" : ""} dropped by
              at least {threshold}% vs the previous week.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {flagged.slice(0, 4).map((r) => (
            <span
              key={r.campaignId}
              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200"
            >
              {r.campaign}
              <span className="font-bold">-{r.dropPercent}%</span>
            </span>
          ))}
          {flagged.length > 4 && (
            <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
              +{flagged.length - 4} more
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
