"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

// Build the shared query string used by every API call from the current filters.
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
      if (!res.ok) throw new Error(`בקשת הנתונים נכשלה (${res.status})`);
      setStats(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת הנתונים נכשלה");
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
      setLastSync(summary.message ?? "הסנכרון הושלם");
      await Promise.all([loadCampaigns(), loadStats()]);
    } catch {
      setLastSync("הסנכרון נכשל");
    } finally {
      setSyncing(false);
    }
  }

  const campaignLabel =
    campaign === "all"
      ? "כל הקמפיינים"
      : campaigns.find((c) => c.id === campaign)?.name ?? "קמפיין";

  const flagged = stats?.regressions.filter((r) => r.isRegression) ?? [];
  const hasRegressionForView =
    campaign === "all"
      ? flagged.length > 0
      : flagged.some((r) => r.campaignId === campaign);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-2xl ring-1 ring-white/10">
            📡
          </div>
          <div>
            <h1 className="text-gradient text-2xl font-extrabold tracking-tight">
              דשבורד קמפיינים ולידים
            </h1>
            <p className="mt-0.5 text-sm text-slate-400">
              מטמון חי של נתוני ליד מנג׳ר · מדדים, מגמות והתראות ירידה
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastSync && (
            <span className="hidden text-xs text-slate-500 sm:inline">{lastSync}</span>
          )}
          <Link
            href="/seo"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-emerald-400/40 hover:text-emerald-200"
          >
            🌱 דוח קידום אורגני
          </Link>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-neon inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-70"
          >
            {syncing && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {syncing ? "מסנכרן…" : "סנכרן עכשיו"}
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="glass flex flex-col gap-4 rounded-2xl p-4 lg:flex-row lg:items-start lg:justify-between">
        <DateRangePicker value={range} onChange={setRange} />
        <CampaignSelector campaigns={campaigns} value={campaign} onChange={setCampaign} />
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-200 backdrop-blur-xl">
          {error}. נסה ללחוץ &quot;סנכרן עכשיו&quot; כדי למלא נתונים.
        </div>
      )}

      {/* Alert banner */}
      {stats && <AlertBanner flagged={flagged} threshold={stats.alertThresholdPercent} />}

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
        <p className="text-center text-sm text-slate-500">טוען דשבורד…</p>
      )}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="glass h-28 animate-pulse rounded-2xl" />
      ))}
    </div>
  );
}
