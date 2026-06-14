"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@tremor/react";
import DateRangePicker, { type RangeSelection } from "./DateRangePicker";
import CampaignSelector, { type CampaignOption } from "./CampaignSelector";
import KpiCards from "./KpiCards";
import AlertBanner from "./AlertBanner";
import LeadsTrendChart from "./LeadsTrendChart";
import DistributionCharts from "./DistributionCharts";
import LeadsTable from "./LeadsTable";
import type { StatsResponse } from "@/lib/types";
import { resolvePreset } from "@/lib/dates";
import { format } from "date-fns";

// Build the shared query string used by every API call from the current
// filter selection.
function buildQuery(range: RangeSelection, campaign: string): string {
  const params = new URLSearchParams();
  params.set("preset", range.preset);
  params.set("campaign", campaign);
  if (range.preset === "custom") {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  return params.toString();
}

const defaultRange = (): RangeSelection => {
  const r = resolvePreset("last7");
  return {
    preset: "last7",
    from: format(new Date(r.from), "yyyy-MM-dd"),
    to: format(new Date(r.to), "yyyy-MM-dd"),
  };
};

export default function DashboardClient() {
  const [range, setRange] = useState<RangeSelection>(defaultRange);
  const [campaign, setCampaign] = useState<string>("all");
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const query = useMemo(() => buildQuery(range, campaign), [range, campaign]);

  const loadCampaigns = useCallback(async () => {
    const res = await fetch("/api/campaigns");
    if (res.ok) {
      const data = await res.json();
      setCampaigns(data.campaigns);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stats?${query}`);
      if (!res.ok) throw new Error(`Stats request failed (${res.status})`);
      setStats(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const summary = await res.json();
      setLastSync(summary.message ?? "Sync complete");
      await Promise.all([loadCampaigns(), loadStats()]);
    } catch {
      setLastSync("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const campaignLabel =
    campaign === "all"
      ? "All Campaigns"
      : campaigns.find((c) => c.id === campaign)?.name ?? "Campaign";

  const flagged = stats?.regressions.filter((r) => r.isRegression) ?? [];
  // When a single campaign is selected, only glow if that campaign regressed.
  const hasRegressionForView =
    campaign === "all"
      ? flagged.length > 0
      : flagged.some((r) => r.campaignId === campaign);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Campaign &amp; Lead Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Live cache of Lead Manager (ליד מנג&apos;ר) data · KPIs, trends &amp;
            regression alerts
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastSync && (
            <span className="hidden text-xs text-slate-400 sm:inline">
              {lastSync}
            </span>
          )}
          <Button onClick={handleSync} loading={syncing} variant="primary">
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 lg:flex-row lg:items-start lg:justify-between">
        <DateRangePicker value={range} onChange={setRange} />
        <CampaignSelector
          campaigns={campaigns}
          value={campaign}
          onChange={setCampaign}
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {error}. Try running <code>npm run db:seed</code> or click “Sync now”.
        </div>
      )}

      {/* Alert banner */}
      {stats && (
        <AlertBanner flagged={flagged} threshold={stats.alertThresholdPercent} />
      )}

      {/* KPIs */}
      {stats ? (
        <KpiCards stats={stats} hasRegression={hasRegressionForView} />
      ) : (
        <LoadingGrid />
      )}

      {/* Charts */}
      {stats && (
        <>
          <LeadsTrendChart trend={stats.trend} campaignLabel={campaignLabel} />
          <DistributionCharts
            bySource={stats.bySource}
            byStatus={stats.byStatus}
            byCampaign={stats.byCampaign}
            showCampaign={campaign === "all"}
          />
        </>
      )}

      {/* Data table */}
      <LeadsTable baseQuery={query} />

      {loading && !stats && (
        <p className="text-center text-sm text-slate-400">Loading dashboard…</p>
      )}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-xl bg-slate-100 ring-1 ring-slate-200"
        />
      ))}
    </div>
  );
}
