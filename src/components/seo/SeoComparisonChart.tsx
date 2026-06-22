"use client";

import { AreaChart } from "@tremor/react";
import type { SeoSeriesPoint } from "@/lib/seoTypes";
import { formatNumber } from "@/lib/format";
import { format } from "date-fns";

// A 60-day series overlaid on the equal-length previous period. Both series share
// the same x-axis (the current period's dates) so the improvement is visible.
export default function SeoComparisonChart({
  title,
  subtitle,
  icon,
  series,
  color,
  valueFormatter = formatNumber,
}: {
  title: string;
  subtitle: string;
  icon: string;
  series: SeoSeriesPoint[];
  color: string;
  valueFormatter?: (n: number) => string;
}) {
  const data = series.map((p) => ({
    date: format(new Date(p.date), "dd/MM"),
    "60 הימים האחרונים": p.current,
    "60 הימים הקודמים": p.previous,
  }));

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
      </div>
      <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>
      <div className="ltr-embed mt-4">
        <AreaChart
          className="h-72"
          data={data}
          index="date"
          categories={["60 הימים האחרונים", "60 הימים הקודמים"]}
          colors={[color, "slate"]}
          valueFormatter={valueFormatter}
          showLegend
          showGridLines
          curveType="monotone"
          noDataText="אין נתונים לתקופה זו."
          intervalType="preserveStartEnd"
        />
      </div>
    </div>
  );
}
