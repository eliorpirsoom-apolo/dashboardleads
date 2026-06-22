"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import type { SeoReport } from "@/lib/seoTypes";
import ClientSelector, { type ClientOption } from "./ClientSelector";
import SeoKpiCards from "./SeoKpiCards";
import SeoComparisonChart from "./SeoComparisonChart";
import ImprovedKeywordsTable from "./ImprovedKeywordsTable";
import TasksPanel from "./TasksPanel";
import { formatNumber } from "@/lib/format";

function formatRange(from: string, to: string): string {
  const f = (d: string) => format(new Date(d), "dd/MM/yyyy");
  return `${f(from)} – ${f(to)}`;
}

export default function SeoReportClient() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [report, setReport] = useState<SeoReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const loadClients = useCallback(async () => {
    const res = await fetch("/api/clients");
    if (res.ok) {
      const data = await res.json();
      setClients(data.clients);
      setClientId((prev) => prev || data.clients[0]?.id || "");
      return data.clients as ClientOption[];
    }
    return [];
  }, []);

  const loadReport = useCallback(async () => {
    if (!clientId) {
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/seo/report?clientId=${clientId}`);
      if (!res.ok) throw new Error(`טעינת הדוח נכשלה (${res.status})`);
      setReport(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת הדוח נכשלה");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadClients().finally(() => setLoading(false));
  }, [loadClients]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const isDemo =
    report && (report.source.gsc === "demo" || report.source.ga === "demo");

  return (
    <div className="space-y-6">
      {/* Toolbar — excluded from the printed/exported report. */}
      <div className="no-print flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/20 to-cyan-500/20 text-2xl ring-1 ring-white/10">
            🌱
          </div>
          <div>
            <h1 className="text-gradient text-2xl font-extrabold tracking-tight">
              דוח קידום אורגני
            </h1>
            <p className="mt-0.5 text-sm text-slate-400">
              Search Console · Analytics · מיקומי ביטויים ומשימות
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-cyan-400/40"
          >
            ← לדשבורד הלידים
          </Link>
          <ClientSelector
            clients={clients}
            value={clientId}
            onChange={setClientId}
          />
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-cyan-400/40"
          >
            + לקוח
          </button>
          <button
            onClick={() => window.print()}
            disabled={!report}
            className="btn-neon rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            ייצוא PDF
          </button>
        </div>
      </div>

      {showAdd && (
        <AddClientForm
          onClose={() => setShowAdd(false)}
          onCreated={async (id) => {
            setShowAdd(false);
            await loadClients();
            setClientId(id);
          }}
        />
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {clients.length === 0 && !loading && (
        <div className="glass rounded-2xl p-8 text-center text-slate-300">
          <p className="text-lg font-semibold">עדיין אין לקוחות</p>
          <p className="mt-1 text-sm text-slate-400">
            הוסף לקוח כדי להפיק דוח קידום אורגני. ניתן לחבר מאפיין Search Console
            ומזהה GA4, או להתחיל עם נתוני דמו.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="btn-neon mt-4 rounded-lg px-4 py-2 text-sm font-semibold"
          >
            + הוספת לקוח
          </button>
        </div>
      )}

      {loading && !report && clients.length > 0 && (
        <p className="text-center text-sm text-slate-500">טוען דוח…</p>
      )}

      {report && (
        <div id="seo-report" className="space-y-6">
          {/* Report header (included in the export). */}
          <header className="glass rounded-2xl p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-100">
                  {report.client.name}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  דוח קידום אורגני · 60 ימים בהשוואה ל-60 הימים שלפניהם
                </p>
              </div>
              <div className="text-sm text-slate-400 sm:text-left">
                <p>
                  תקופה נוכחית:{" "}
                  <span className="font-medium text-slate-200">
                    {formatRange(report.currentRange.from, report.currentRange.to)}
                  </span>
                </p>
                <p>
                  תקופה קודמת:{" "}
                  <span className="font-medium text-slate-300">
                    {formatRange(report.previousRange.from, report.previousRange.to)}
                  </span>
                </p>
              </div>
            </div>
            {isDemo && (
              <p className="no-print mt-3 inline-block rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300 ring-1 ring-amber-500/30">
                ⚠ חלק מהנתונים הם נתוני דמו — חבר מאפיין Search Console / GA4 ללקוח
                להצגת נתונים אמיתיים.
              </p>
            )}
          </header>

          <SeoKpiCards report={report} />

          <SeoComparisonChart
            title="קליקים מחיפוש אורגני (Search Console)"
            subtitle={`סה״כ ${formatNumber(report.kpis.clicks.value)} קליקים ב-60 הימים האחרונים`}
            icon="🖱️"
            series={report.gscClicksTrend}
            color="cyan"
          />

          <SeoComparisonChart
            title="חשיפות בגוגל (Search Console)"
            subtitle={`סה״כ ${formatNumber(report.kpis.impressions.value)} חשיפות ב-60 הימים האחרונים`}
            icon="👁️"
            series={report.gscImpressionsTrend}
            color="violet"
          />

          <SeoComparisonChart
            title="תנועה לאתר (Google Analytics)"
            subtitle={`סה״כ ${formatNumber(report.kpis.sessions.value)} כניסות ב-60 הימים האחרונים`}
            icon="📈"
            series={report.gaSessionsTrend}
            color="emerald"
          />

          <ImprovedKeywordsTable keywords={report.improvedKeywords} />

          <TasksPanel
            clientId={report.client.id}
            thisMonth={report.thisMonth}
            nextMonth={report.nextMonth}
            tasksDone={report.tasksDone}
            tasksPlanned={report.tasksPlanned}
            onChanged={loadReport}
          />

          <p className="hidden text-center text-xs text-slate-500 print:block">
            הופק בתאריך {format(new Date(), "dd/MM/yyyy")}
          </p>
        </div>
      )}
    </div>
  );
}

function AddClientForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [gscProperty, setGsc] = useState("");
  const [ga4PropertyId, setGa4] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, gscProperty, ga4PropertyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "יצירת הלקוח נכשלה");
      onCreated(data.client.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "יצירת הלקוח נכשלה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass no-print rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-slate-100">הוספת לקוח</h3>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-slate-400">שם הלקוח *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-400/60"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            מאפיין Search Console
          </label>
          <input
            value={gscProperty}
            onChange={(e) => setGsc(e.target.value)}
            placeholder="sc-domain:example.co.il"
            dir="ltr"
            className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-400/60"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            מזהה מאפיין GA4
          </label>
          <input
            value={ga4PropertyId}
            onChange={(e) => setGa4(e.target.value)}
            placeholder="123456789"
            dir="ltr"
            className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-400/60"
          />
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={saving || !name.trim()}
          className="btn-neon rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-60"
        >
          {saving ? "שומר…" : "שמירה"}
        </button>
        <button
          onClick={onClose}
          className="rounded-lg border border-white/10 bg-slate-900/60 px-4 py-1.5 text-sm text-slate-300"
        >
          ביטול
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        ניתן להשאיר את שדות Google ריקים — הדוח יוצג עם נתוני דמו עד לחיבור.
      </p>
    </div>
  );
}
