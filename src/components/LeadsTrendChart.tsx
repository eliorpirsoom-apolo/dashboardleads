"use client";

import { AreaChart } from "@tremor/react";
import type { TrendPoint } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { format } from "date-fns";

export default function LeadsTrendChart({
  trend,
  campaignLabel,
}: {
  trend: TrendPoint[];
  campaignLabel: string;
}) {
  const data = trend.map((p) => ({
    date: format(new Date(p.date), "dd/MM"),
    לידים: p.leads,
  }));

  const total = trend.reduce((s, p) => s + p.leads, 0);

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <span className="text-lg">📈</span>
        <h3 className="text-lg font-semibold text-slate-100">מגמת לידים</h3>
      </div>
      <p className="mt-0.5 text-sm text-slate-400">
        {campaignLabel} · {formatNumber(total)} לידים בתקופה שנבחרה
      </p>
      <div className="ltr-embed mt-4">
        <AreaChart
          className="h-72"
          data={data}
          index="date"
          categories={["לידים"]}
          colors={["cyan"]}
          valueFormatter={formatNumber}
          showLegend={false}
          showGridLines
          curveType="monotone"
          noDataText="אין לידים בתקופה שנבחרה."
        />
      </div>
    </div>
  );
}
