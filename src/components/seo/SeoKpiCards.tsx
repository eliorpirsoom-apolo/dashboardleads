"use client";

import { BadgeDelta } from "@tremor/react";
import type { SeoMetric, SeoReport } from "@/lib/seoTypes";
import { formatNumber, formatPercent } from "@/lib/format";

type DeltaType =
  | "increase"
  | "moderateIncrease"
  | "unchanged"
  | "moderateDecrease"
  | "decrease";

// Map a comparison to a Tremor BadgeDelta type. `lowerIsBetter` flips the
// good/bad sense (used for average position, where a smaller number is better).
function deltaType(c: SeoMetric, lowerIsBetter = false): DeltaType {
  if (c.direction === "flat" || c.deltaPercent === null) return "unchanged";
  const improving = lowerIsBetter ? c.direction === "down" : c.direction === "up";
  const strong = Math.abs(c.deltaPercent) > 10;
  if (improving) return strong ? "increase" : "moderateIncrease";
  return strong ? "decrease" : "moderateDecrease";
}

function SeoKpiCard({
  title,
  icon,
  metric,
  comparison,
  previousLabel,
  lowerIsBetter,
}: {
  title: string;
  icon: string;
  metric: string;
  comparison: SeoMetric;
  previousLabel: string;
  lowerIsBetter?: boolean;
}) {
  return (
    <div className="glass glass-hover relative overflow-hidden rounded-2xl p-5">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
      <div className="flex items-center gap-2">
        <span className="text-lg opacity-80">{icon}</span>
        <span className="text-sm font-medium text-slate-300">{title}</span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <span className="text-gradient text-3xl font-extrabold tracking-tight">
          {metric}
        </span>
        <span className="ltr-embed">
          <BadgeDelta deltaType={deltaType(comparison, lowerIsBetter)} size="xs">
            {formatPercent(comparison.deltaPercent)}
          </BadgeDelta>
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{previousLabel}</p>
    </div>
  );
}

export default function SeoKpiCards({ report }: { report: SeoReport }) {
  const { kpis } = report;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SeoKpiCard
        title="קליקים (חיפוש אורגני)"
        icon="🖱️"
        metric={formatNumber(kpis.clicks.value)}
        comparison={kpis.clicks}
        previousLabel={`מול 60 הימים הקודמים (${formatNumber(kpis.clicks.previousValue)})`}
      />
      <SeoKpiCard
        title="חשיפות בגוגל"
        icon="👁️"
        metric={formatNumber(kpis.impressions.value)}
        comparison={kpis.impressions}
        previousLabel={`מול 60 הימים הקודמים (${formatNumber(kpis.impressions.previousValue)})`}
      />
      <SeoKpiCard
        title="מיקום ממוצע"
        icon="📍"
        metric={kpis.avgPosition.value.toFixed(1)}
        comparison={kpis.avgPosition}
        lowerIsBetter
        previousLabel={`מול 60 הימים הקודמים (${kpis.avgPosition.previousValue.toFixed(1)})`}
      />
      <SeoKpiCard
        title="כניסות מאנליטיקס"
        icon="📈"
        metric={formatNumber(kpis.sessions.value)}
        comparison={kpis.sessions}
        previousLabel={`מול 60 הימים הקודמים (${formatNumber(kpis.sessions.previousValue)})`}
      />
    </div>
  );
}
