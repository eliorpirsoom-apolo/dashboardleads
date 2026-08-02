"use client";

import { useCallback, useEffect, useState } from "react";
import { AreaChart } from "@tremor/react";
import { api } from "@/lib/fetcher";
import { formatDate, formatNumber } from "@/lib/format";
import { Button, Card, Chip, Field, Input, Select, StatCard } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface Snapshot {
  date: string;
  source: string;
  clicks: number | null;
  impressions: number | null;
  position: number | null;
  sessions: number | null;
  users: number | null;
  conversions: number | null;
}

interface KeywordRow {
  id: string;
  keyword: string;
  current: number | null;
  previous: number | null;
  lastDate: string | null;
  clicks: number | null;
}

interface IntegrationStatus {
  kind: string;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
}

export default function SeoView({
  clientId,
  isAdmin,
}: {
  clientId: string;
  isAdmin: boolean;
}) {
  const [days, setDays] = useState(30);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [keywords, setKeywords] = useState<KeywordRow[]>([]);
  const [organicLeads, setOrganicLeads] = useState(0);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{
        snapshots: Snapshot[];
        keywords: KeywordRow[];
        organicLeads: number;
        integrations: IntegrationStatus[];
      }>(`/api/seo/data?clientId=${clientId}&days=${days}`);
      setSnapshots(d.snapshots);
      setKeywords(d.keywords);
      setOrganicLeads(d.organicLeads);
      setIntegrations(d.integrations);
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId, days]);

  useEffect(() => {
    load();
  }, [load]);

  async function addKeyword(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    try {
      await api("/api/seo/keywords", {
        method: "POST",
        json: { clientId, keyword: newKeyword },
      });
      setNewKeyword("");
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const gsc = snapshots.filter((s) => s.source === "search_console");
  const ga = snapshots.filter((s) => s.source === "ga4");

  const totalClicks = gsc.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const totalImpr = gsc.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const lastPos = gsc.length ? gsc[gsc.length - 1].position : null;
  const totalSessions = ga.reduce((s, r) => s + (r.sessions ?? 0), 0);

  const trafficData = gsc.map((r) => ({
    date: r.date.slice(5),
    "קליקים": r.clicks ?? 0,
    "חשיפות (÷10)": Math.round((r.impressions ?? 0) / 10),
  }));
  const sessionsData = ga.map((r) => ({
    date: r.date.slice(5),
    "ביקורים": r.sessions ?? 0,
    "המרות": r.conversions ?? 0,
  }));
  const positionData = gsc
    .filter((r) => r.position !== null)
    .map((r) => ({ date: r.date.slice(5), "מיקום ממוצע": Number(r.position!.toFixed(1)) }));

  const gscStatus = integrations.find((i) => i.kind === "search_console");
  const gaStatus = integrations.find((i) => i.kind === "ga4");

  return (
    <div className="flex flex-col gap-4">
      {/* Connection banners */}
      <div className="flex flex-wrap gap-2">
        <ConnectionChip
          label="Search Console"
          status={gscStatus}
          isAdmin={isAdmin}
          clientId={clientId}
          kind="search_console"
        />
        <ConnectionChip
          label="Google Analytics"
          status={gaStatus}
          isAdmin={isAdmin}
          clientId={clientId}
          kind="ga4"
        />
        <div className="mr-auto w-32">
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 ימים</option>
            <option value={30}>30 ימים</option>
            <option value={90}>90 ימים</option>
          </Select>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="קליקים מגוגל" value={formatNumber(totalClicks)} icon="search" />
        <StatCard label="חשיפות" value={formatNumber(totalImpr)} icon="eye" />
        <StatCard
          label="מיקום ממוצע"
          value={lastPos ? lastPos.toFixed(1) : "—"}
          sub="נמוך יותר = טוב יותר"
          icon="chart"
        />
        <StatCard label="לידים אורגניים" value={formatNumber(organicLeads)} icon="leads" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-bold text-slate-700">תנועה מחיפוש (Search Console)</h3>
          {trafficData.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-600">אין דאטה עדיין — יתמלא אחרי חיבור וסנכרון ראשון</p>
          ) : (
            <AreaChart
              className="ltr-embed h-56"
              data={trafficData}
              index="date"
              categories={["קליקים", "חשיפות (÷10)"]}
              colors={["cyan", "indigo"]}
              showLegend
              showAnimation
            />
          )}
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-bold text-slate-700">ביקורים והמרות (Analytics)</h3>
          {sessionsData.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-600">אין דאטה עדיין — יתמלא אחרי חיבור וסנכרון ראשון</p>
          ) : (
            <AreaChart
              className="ltr-embed h-56"
              data={sessionsData}
              index="date"
              categories={["ביקורים", "המרות"]}
              colors={["emerald", "amber"]}
              showLegend
              showAnimation
            />
          )}
        </Card>
      </div>

      <Card>
        <h3 className="mb-2 text-sm font-bold text-slate-700">מיקום ממוצע בגוגל לאורך זמן</h3>
        {positionData.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-600">אין דאטת מיקומים עדיין</p>
        ) : (
          <AreaChart
            className="ltr-embed h-48"
            data={positionData}
            index="date"
            categories={["מיקום ממוצע"]}
            colors={["violet"]}
            showLegend={false}
            showAnimation
          />
        )}
      </Card>

      {/* Tracked keywords */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-700">מילות מפתח במעקב</h3>
          <form onSubmit={addKeyword} className="flex gap-2">
            <Input
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="מילת מפתח חדשה…"
              className="w-52"
            />
            <Button type="submit" size="sm">
              <Icon name="plus" className="h-3.5 w-3.5" />
              מעקב
            </Button>
          </form>
        </div>
        {keywords.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-600">
            הוסיפו מילות מפתח — המיקום שלהן יתעדכן יומית מ-Search Console.
          </p>
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[520px] text-right text-sm">
              <thead>
                <tr className="border-b border-slate-300/60 text-xs text-slate-400">
                  <th className="px-3 py-2 font-medium">מילת מפתח</th>
                  <th className="px-3 py-2 font-medium">מיקום נוכחי</th>
                  <th className="px-3 py-2 font-medium">מגמה</th>
                  <th className="px-3 py-2 font-medium">קליקים</th>
                  <th className="px-3 py-2 font-medium">עודכן</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {keywords.map((k) => {
                  const delta =
                    k.current !== null && k.previous !== null
                      ? k.previous - k.current
                      : null;
                  return (
                    <tr key={k.id}>
                      <td className="px-3 py-2 font-medium text-slate-700">{k.keyword}</td>
                      <td className="px-3 py-2">
                        {k.current !== null ? (
                          <Chip color={k.current <= 3 ? "#34d399" : k.current <= 10 ? "#fbbf24" : "#94a3b8"}>
                            {k.current.toFixed(1)}
                          </Chip>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {delta === null ? (
                          "—"
                        ) : delta > 0.5 ? (
                          <span className="text-emerald-400">▲ שיפור {delta.toFixed(1)}</span>
                        ) : delta < -0.5 ? (
                          <span className="text-red-600">▼ ירידה {Math.abs(delta).toFixed(1)}</span>
                        ) : (
                          <span className="text-slate-500">יציב</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">{k.clicks ?? "—"}</td>
                      <td className="px-3 py-2 text-[11px] text-slate-600">
                        {k.lastDate ? formatDate(k.lastDate) : "טרם נמדד"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* AI visibility — future experiment, per spec decision */}
      <Card className="border-dashed !border-slate-300">
        <div className="flex items-center gap-3">
          <span className="text-xl">🤖</span>
          <div>
            <p className="text-sm font-bold text-slate-600">בדיקת נראות בבינה מלאכותית</p>
            <p className="text-xs text-slate-500">
              מעקב אחרי הופעת העסק בתשובות של ChatGPT/Gemini — התחום צעיר; ייבחן ויתווסף
              כשיהיה כלי מדידה אמין. (הוגדר באפיון כניסוי עתידי.)
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ConnectionChip({
  label,
  status,
  isAdmin,
  clientId,
  kind,
}: {
  label: string;
  status?: IntegrationStatus;
  isAdmin: boolean;
  clientId: string;
  kind: string;
}) {
  const connected = status?.status === "connected";
  const errored = status?.status === "error";
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
      <span
        className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : errored ? "bg-red-400" : "bg-slate-600"}`}
      />
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <span className="text-[10px] text-slate-500">
        {connected
          ? status?.lastSyncAt
            ? `סונכרן ${formatDate(status.lastSyncAt)}`
            : "מחובר"
          : errored
            ? "שגיאה"
            : "לא מחובר"}
      </span>
      {isAdmin && !connected ? (
        <a
          href={`/api/integrations/google/connect?clientId=${clientId}&kind=${kind}`}
          className="text-[10px] font-bold text-cyan-400 hover:underline"
        >
          חיבור ←
        </a>
      ) : null}
    </div>
  );
}
