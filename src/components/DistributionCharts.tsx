"use client";

import { DonutChart, BarList, Legend } from "@tremor/react";
import type { NamedCount } from "@/lib/types";
import { formatNumber } from "@/lib/format";

function Heading({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
      </div>
      <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>
    </div>
  );
}

const cardCls = "glass rounded-2xl p-6";

// Source distribution (donut) + status / campaign breakdown (bar lists).
export default function DistributionCharts({
  bySource,
  byStatus,
  byCampaign,
  showCampaign,
}: {
  bySource: NamedCount[];
  byStatus: NamedCount[];
  byCampaign: NamedCount[];
  showCampaign: boolean;
}) {
  const sourceData = bySource.map((s) => ({ name: s.name, value: s.value }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className={cardCls}>
        <Heading icon="🌐" title="לידים לפי מקור" subtitle="התפלגות מקורות" />
        <div className="ltr-embed">
          <DonutChart
            className="mt-4 h-52"
            data={sourceData}
            category="value"
            index="name"
            colors={["cyan", "indigo", "violet", "blue", "fuchsia", "emerald"]}
            valueFormatter={formatNumber}
            noDataText="אין נתונים."
          />
          <Legend
            className="mt-4"
            categories={sourceData.slice(0, 6).map((s) => s.name)}
            colors={["cyan", "indigo", "violet", "blue", "fuchsia", "emerald"]}
          />
        </div>
      </div>

      <div className={cardCls}>
        <Heading icon="🧭" title="לידים לפי סטטוס" subtitle="פילוח לאורך המשפך" />
        <BarList
          data={byStatus.map((s) => ({ name: s.name, value: s.value }))}
          className="mt-4"
          color="cyan"
          valueFormatter={formatNumber}
        />
      </div>

      {showCampaign ? (
        <div className={cardCls}>
          <Heading icon="🏆" title="לידים לפי קמפיין" subtitle="המובילים" />
          <BarList
            data={byCampaign.slice(0, 8).map((c) => ({ name: c.name, value: c.value }))}
            className="mt-4"
            color="violet"
            valueFormatter={formatNumber}
          />
        </div>
      ) : (
        <div className={cardCls}>
          <Heading icon="📦" title="סיכום לפי מקור" subtitle="ספירה גולמית" />
          <BarList
            data={bySource.map((s) => ({ name: s.name, value: s.value }))}
            className="mt-4"
            color="indigo"
            valueFormatter={formatNumber}
          />
        </div>
      )}
    </div>
  );
}
