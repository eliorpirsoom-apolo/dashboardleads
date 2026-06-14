"use client";

import { Card, Title, Text, DonutChart, BarList, Legend } from "@tremor/react";
import type { NamedCount } from "@/lib/types";
import { formatNumber } from "@/lib/format";

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
      <Card>
        <Title>Leads by Source</Title>
        <DonutChart
          className="mt-4 h-52"
          data={sourceData}
          category="value"
          index="name"
          valueFormatter={formatNumber}
          noDataText="No data."
        />
        <Legend
          className="mt-4"
          categories={sourceData.slice(0, 6).map((s) => s.name)}
        />
      </Card>

      <Card>
        <Title>Leads by Status</Title>
        <Text className="text-slate-400">Pipeline distribution</Text>
        <BarList
          data={byStatus.map((s) => ({ name: s.name, value: s.value }))}
          className="mt-4"
          valueFormatter={formatNumber}
        />
      </Card>

      {showCampaign ? (
        <Card>
          <Title>Leads by Campaign</Title>
          <Text className="text-slate-400">Top performers</Text>
          <BarList
            data={byCampaign
              .slice(0, 8)
              .map((c) => ({ name: c.name, value: c.value }))}
            className="mt-4"
            color="indigo"
            valueFormatter={formatNumber}
          />
        </Card>
      ) : (
        <Card>
          <Title>Source Totals</Title>
          <Text className="text-slate-400">Raw counts</Text>
          <BarList
            data={bySource.map((s) => ({ name: s.name, value: s.value }))}
            className="mt-4"
            color="cyan"
            valueFormatter={formatNumber}
          />
        </Card>
      )}
    </div>
  );
}
