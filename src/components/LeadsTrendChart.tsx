"use client";

import { Card, Title, Text, AreaChart } from "@tremor/react";
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
    date: format(new Date(p.date), "dd MMM"),
    Leads: p.leads,
  }));

  const total = trend.reduce((s, p) => s + p.leads, 0);

  return (
    <Card>
      <Title>Leads Trend</Title>
      <Text className="text-slate-400">
        {campaignLabel} · {formatNumber(total)} leads in selected period
      </Text>
      <AreaChart
        className="mt-4 h-72"
        data={data}
        index="date"
        categories={["Leads"]}
        colors={["blue"]}
        valueFormatter={formatNumber}
        showLegend={false}
        showGridLines
        curveType="monotone"
        noDataText="No leads in the selected period."
      />
    </Card>
  );
}
