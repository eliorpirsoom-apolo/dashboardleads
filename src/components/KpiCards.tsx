"use client";

import { BadgeDelta } from "@tremor/react";
import type { StatsResponse, MetricComparison } from "@/lib/types";
import { formatNumber, formatPercent } from "@/lib/format";

type DeltaType =
  | "increase"
  | "moderateIncrease"
  | "unchanged"
  | "moderateDecrease"
  | "decrease";

// Map a comparison to a Tremor BadgeDelta type.
function deltaType(c: MetricComparison): DeltaType {
  if (c.direction === "flat" || c.deltaPercent === null) return "unchanged";
  if (c.direction === "up") {
    return Math.abs(c.deltaPercent) > 10 ? "increase" : "moderateIncrease";
  }
  return Math.abs(c.deltaPercent) > 10 ? "decrease" : "moderateDecrease";
}

interface KpiDef {
  title: string;
  metric: string;
  icon: string;
  comparison: MetricComparison;
  alert?: boolean;
}

function KpiCard({ title, metric, icon, comparison, alert }: KpiDef) {
  return (
    <div
      className={`glass glass-hover relative overflow-hidden rounded-2xl p-5 ${
        alert ? "animate-pulse-glow !border-red-500/60" : ""
      }`}
    >
      {/* top accent line */}
      <div
        className={`absolute inset-x-0 top-0 h-px ${
          alert
            ? "bg-gradient-to-r from-transparent via-red-500 to-transparent"
            : "bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent"
        }`}
      />
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg opacity-80">{icon}</span>
          <span className="text-sm font-medium text-slate-300">{title}</span>
        </div>
        {alert && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300 ring-1 ring-red-500/30">
            ⚠ ירידה
          </span>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between">
        <span className="text-gradient text-3xl font-extrabold tracking-tight">
          {metric}
        </span>
        <span className="ltr-embed">
          <BadgeDelta deltaType={deltaType(comparison)} size="xs">
            {formatPercent(comparison.deltaPercent)}
          </BadgeDelta>
        </span>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        מול תקופה קודמת ({formatNumber(comparison.previousValue)})
      </p>
    </div>
  );
}

export default function KpiCards({
  stats,
  hasRegression,
}: {
  stats: StatsResponse;
  hasRegression: boolean;
}) {
  const { kpis } = stats;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title="סך הלידים"
        icon="📊"
        metric={formatNumber(kpis.totalLeads.value)}
        comparison={kpis.totalLeads}
        alert={hasRegression}
      />
      <KpiCard
        title="קמפיינים פעילים"
        icon="🎯"
        metric={formatNumber(kpis.activeCampaigns.value)}
        comparison={kpis.activeCampaigns}
      />
      <KpiCard
        title="ממוצע לידים ליום"
        icon="📈"
        metric={kpis.avgLeadsPerDay.value.toLocaleString("he-IL")}
        comparison={kpis.avgLeadsPerDay}
      />
      <KpiCard
        title="אחוז המרה"
        icon="⚡"
        metric={`${kpis.conversionRate.value.toFixed(1)}%`}
        comparison={kpis.conversionRate}
      />
    </div>
  );
}
