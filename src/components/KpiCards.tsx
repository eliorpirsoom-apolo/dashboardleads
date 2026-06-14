"use client";

import { Card, Metric, Text, BadgeDelta, Flex } from "@tremor/react";
import type { StatsResponse, MetricComparison } from "@/lib/types";
import { formatNumber, formatPercent } from "@/lib/format";

type DeltaType = "increase" | "moderateIncrease" | "unchanged" | "moderateDecrease" | "decrease";

// Map a comparison to a Tremor BadgeDelta type. `higherIsBetter` controls the
// color semantics (e.g. a drop in leads is bad/red, a drop in "Lost" is good).
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
  comparison: MetricComparison;
  // When true, render a red alert glow (regression detected).
  alert?: boolean;
}

function KpiCard({ title, metric, comparison, alert }: KpiDef) {
  return (
    <Card
      className={`relative ${
        alert ? "animate-pulse-glow ring-2 ring-red-500" : ""
      }`}
      decoration={alert ? "left" : undefined}
      decorationColor={alert ? "red" : undefined}
    >
      <Flex alignItems="start" justifyContent="between">
        <Text className="font-medium">{title}</Text>
        {alert && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
            ⚠ Drop
          </span>
        )}
      </Flex>
      <Flex alignItems="baseline" justifyContent="between" className="mt-2">
        <Metric>{metric}</Metric>
        <BadgeDelta deltaType={deltaType(comparison)} size="xs">
          {formatPercent(comparison.deltaPercent)}
        </BadgeDelta>
      </Flex>
      <Text className="mt-1 text-xs text-slate-400">
        vs previous period ({formatNumber(comparison.previousValue)})
      </Text>
    </Card>
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
        title="Total Leads"
        metric={formatNumber(kpis.totalLeads.value)}
        comparison={kpis.totalLeads}
        alert={hasRegression}
      />
      <KpiCard
        title="Active Campaigns"
        metric={formatNumber(kpis.activeCampaigns.value)}
        comparison={kpis.activeCampaigns}
      />
      <KpiCard
        title="Avg Leads / Day"
        metric={kpis.avgLeadsPerDay.value.toLocaleString("en-US")}
        comparison={kpis.avgLeadsPerDay}
      />
      <KpiCard
        title="Conversion Rate"
        metric={`${kpis.conversionRate.value.toFixed(1)}%`}
        comparison={kpis.conversionRate}
      />
    </div>
  );
}
