"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatCurrency, formatNumber } from "@/lib/format";
import { channelLabel } from "@/lib/defaults";
import { Button, Card, Field, Input, Select, StatCard } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

interface Summary {
  totals: {
    leads: number;
    won: number;
    conversion: number;
    budget: number;
    spend: number;
    cpl: number | null;
    contractsCount: number;
    contractsValue: number;
  };
  byChannel: { channel: string | null; count: number }[];
  byCampaign: { name: string; count: number }[];
  byStatus: { name: string; color: string; count: number }[];
  byKind: { kind: string; count: number }[];
  inventory: { project: string; total: number; sold: number }[];
}

interface BudgetRow {
  id: string;
  period: string;
  periodKey: string;
  amount: number;
  spend: number;
  leads: number;
  cpl: number | null;
  campaign: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
}

interface TopAd {
  id: string;
  rank: number;
  name: string;
  platform: string | null;
  metric: string | null;
}

function monthStart(): string {
  return new Date().toISOString().slice(0, 8) + "01";
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsView({
  clientId,
  isRealestate,
}: {
  clientId: string;
  isRealestate: boolean;
}) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [topAds, setTopAds] = useState<TopAd[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState("");
  const [showBudget, setShowBudget] = useState(false);
  const [editAd, setEditAd] = useState<1 | 2 | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [s, b, t] = await Promise.all([
        api<Summary>(`/api/reports/summary?clientId=${clientId}&from=${from}&to=${to}`),
        api<{ budgets: BudgetRow[] }>(`/api/budgets?clientId=${clientId}`),
        api<{ ads: TopAd[] }>(`/api/top-ads?clientId=${clientId}&month=${month}`),
      ]);
      setSummary(s);
      setBudgets(b.budgets.slice(0, 8));
      setTopAds(t.ads);
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId, from, to, month]);

  useEffect(() => {
    load();
  }, [load]);

  const t = summary?.totals;

  return (
    <div className="flex flex-col gap-4">
      {/* Range picker + print */}
      <div className="glass flex flex-wrap items-end gap-3 rounded-2xl p-4 print:hidden">
        <div className="w-36">
          <Field label="מתאריך">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
        </div>
        <div className="w-36">
          <Field label="עד תאריך">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <div className="mr-auto flex gap-2">
          <Button variant="ghost" onClick={() => window.print()}>
            <Icon name="doc" className="h-4 w-4" />
            הדפסה / PDF
          </Button>
          <Button variant="ghost" onClick={() => setShowBudget(true)}>
            <Icon name="money" className="h-4 w-4" />
            עדכון תקציב
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {t ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="לידים בתקופה" value={formatNumber(t.leads)} icon="leads" />
            <StatCard
              label="עסקאות"
              value={formatNumber(t.won)}
              sub={`המרה: ${t.conversion.toFixed(1)}%`}
              icon="check"
            />
            <StatCard
              label="עלות לליד"
              value={t.cpl ? formatCurrency(t.cpl) : "—"}
              sub={`תקציב ${formatCurrency(t.budget)} · הוצאה ${formatCurrency(t.spend)}`}
              icon="money"
            />
            <StatCard
              label="ערך חוזים"
              value={t.contractsValue ? formatCurrency(t.contractsValue) : "—"}
              sub={`${t.contractsCount} חוזים`}
              icon="doc"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <BreakdownCard
              title="לפי ערוץ"
              rows={summary!.byChannel.map((r) => ({
                label: channelLabel(r.channel),
                count: r.count,
              }))}
            />
            <BreakdownCard
              title="לפי קמפיין"
              rows={summary!.byCampaign.map((r) => ({ label: r.name, count: r.count }))}
            />
            <Card>
              <h3 className="mb-3 text-sm font-bold text-slate-200">לפי סטטוס</h3>
              <div className="flex flex-col gap-2">
                {summary!.byStatus.map((s, i) => {
                  const max = Math.max(...summary!.byStatus.map((x) => x.count), 1);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-24 truncate text-xs text-slate-400">{s.name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(s.count / max) * 100}%`, backgroundColor: s.color }}
                        />
                      </div>
                      <span className="w-7 text-left text-xs font-bold text-slate-300">{s.count}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {isRealestate && summary!.inventory.length > 0 ? (
            <Card>
              <h3 className="mb-3 text-sm font-bold text-slate-200">מצב מלאי — פרויקטים</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {summary!.inventory.map((inv, i) => {
                  const pct = inv.total > 0 ? Math.round((inv.sold / inv.total) * 100) : 0;
                  return (
                    <div key={i} className="rounded-xl border border-slate-800 p-3">
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-medium text-slate-300">{inv.project}</span>
                        <span className="text-slate-500">
                          {inv.sold}/{inv.total} נמכרו ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-l from-cyan-400 to-indigo-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </>
      ) : (
        <p className="p-8 text-center text-sm text-slate-500">טוען…</p>
      )}

      {/* Budgets */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200">תקציבים (חודשי / שבועי)</h3>
          <Button variant="ghost" size="sm" onClick={() => setShowBudget(true)} className="print:hidden">
            <Icon name="plus" className="h-3.5 w-3.5" />
            תקציב חדש
          </Button>
        </div>
        {budgets.length === 0 ? (
          <p className="py-3 text-center text-xs text-slate-600">
            אין תקציבים — הוסיפו תקציב כדי לקבל עלות לליד אוטומטית.
          </p>
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[560px] text-right text-sm">
              <thead>
                <tr className="border-b border-slate-700/60 text-xs text-slate-400">
                  <th className="px-3 py-2 font-medium">תקופה</th>
                  <th className="px-3 py-2 font-medium">היקף</th>
                  <th className="px-3 py-2 font-medium">תקציב</th>
                  <th className="px-3 py-2 font-medium">הוצאה</th>
                  <th className="px-3 py-2 font-medium">לידים</th>
                  <th className="px-3 py-2 font-medium">עלות לליד</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {budgets.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2 font-mono text-xs">{b.periodKey}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {b.campaign?.name ?? b.project?.name ?? "כל הלקוח"}
                    </td>
                    <td className="px-3 py-2">{formatCurrency(b.amount)}</td>
                    <td className="px-3 py-2">{formatCurrency(b.spend)}</td>
                    <td className="px-3 py-2">{b.leads}</td>
                    <td className="px-3 py-2 font-bold text-cyan-300">
                      {b.cpl ? formatCurrency(b.cpl) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Top 2 ads of the month */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-200">2 המודעות החזקות של החודש</h3>
          <div className="flex items-center gap-2 print:hidden">
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-40"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2].map((rank) => {
            const ad = topAds.find((a) => a.rank === rank);
            return (
              <div
                key={rank}
                className={`relative rounded-2xl border p-4 ${
                  rank === 1 ? "border-amber-500/40 bg-amber-500/5" : "border-slate-700 bg-slate-900/40"
                }`}
              >
                <span className="absolute left-3 top-3 text-2xl">{rank === 1 ? "🥇" : "🥈"}</span>
                {ad ? (
                  <>
                    <p className="font-bold text-slate-100">{ad.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{ad.platform ?? ""}</p>
                    <p className="mt-2 text-sm font-medium text-amber-300">{ad.metric ?? ""}</p>
                  </>
                ) : (
                  <p className="py-4 text-sm text-slate-600">טרם סומנה מודעה #{rank}</p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 print:hidden"
                  onClick={() => setEditAd(rank as 1 | 2)}
                >
                  <Icon name="edit" className="h-3.5 w-3.5" />
                  {ad ? "עדכון" : "סימון מודעה"}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-600 print:hidden">
          בשלב זה הסימון ידני; עם חיבור מנהל המודעות (חלק ד׳) זה יתעדכן אוטומטית.
        </p>
      </Card>

      {showBudget ? (
        <BudgetModal
          clientId={clientId}
          onClose={() => setShowBudget(false)}
          onSaved={() => {
            setShowBudget(false);
            load();
          }}
        />
      ) : null}

      {editAd ? (
        <TopAdModal
          clientId={clientId}
          month={month}
          rank={editAd}
          existing={topAds.find((a) => a.rank === editAd)}
          onClose={() => setEditAd(null)}
          onSaved={() => {
            setEditAd(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number }[];
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <Card>
      <h3 className="mb-3 text-sm font-bold text-slate-200">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-3 text-center text-xs text-slate-600">אין נתונים</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.slice(0, 8).map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-24 truncate text-xs text-slate-400">{r.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-cyan-400 to-indigo-500"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
              <span className="w-7 text-left text-xs font-bold text-slate-300">{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function BudgetModal({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    period: "monthly",
    periodKey: new Date().toISOString().slice(0, 7),
    amount: "",
    spend: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/budgets", {
        method: "POST",
        json: {
          clientId,
          period: form.period,
          periodKey: form.periodKey,
          amount: Number(form.amount) || 0,
          spend: Number(form.spend) || 0,
        },
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="תקציב והוצאה" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="תקופה">
            <Select
              value={form.period}
              onChange={(e) =>
                setForm({
                  ...form,
                  period: e.target.value,
                  periodKey:
                    e.target.value === "monthly"
                      ? new Date().toISOString().slice(0, 7)
                      : `${new Date().getFullYear()}-W${String(Math.ceil(((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000 + new Date(new Date().getFullYear(), 0, 1).getDay() + 1) / 7)).padStart(2, "0")}`,
                })
              }
            >
              <option value="monthly">חודשי</option>
              <option value="weekly">שבועי</option>
            </Select>
          </Field>
          <Field label={form.period === "monthly" ? "חודש" : "שבוע (YYYY-Wnn)"}>
            {form.period === "monthly" ? (
              <Input
                type="month"
                value={form.periodKey}
                onChange={(e) => setForm({ ...form, periodKey: e.target.value })}
              />
            ) : (
              <Input
                dir="ltr"
                value={form.periodKey}
                onChange={(e) => setForm({ ...form, periodKey: e.target.value })}
                placeholder="2026-W28"
              />
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="תקציב (₪)">
            <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </Field>
          <Field label="הוצאה בפועל (₪)">
            <Input type="number" value={form.spend} onChange={(e) => setForm({ ...form, spend: e.target.value })} />
          </Field>
        </div>
        <p className="text-[11px] text-slate-600">
          עלות לליד מחושבת אוטומטית: הוצאה ÷ לידים בתקופה.
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "שומר…" : "שמירה"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function TopAdModal({
  clientId,
  month,
  rank,
  existing,
  onClose,
  onSaved,
}: {
  clientId: string;
  month: string;
  rank: 1 | 2;
  existing?: TopAd;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    platform: existing?.platform ?? "",
    metric: existing?.metric ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/top-ads", {
        method: "POST",
        json: { clientId, month, rank, ...form },
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`מודעה ${rank === 1 ? "🥇 #1" : "🥈 #2"} — ${month}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Field label="שם המודעה">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="פלטפורמה">
            <Input value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} placeholder="facebook / instagram" />
          </Field>
          <Field label="ביצועים">
            <Input value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} placeholder='"23 לידים · 41 ₪ לליד"' />
          </Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "שומר…" : "שמירה"}</Button>
        </div>
      </form>
    </Modal>
  );
}
