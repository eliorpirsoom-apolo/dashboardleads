"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui";

interface Status { id: string; name: string; color: string; isPaid: boolean }
type Kind = "retainer" | "oneoff";
interface Payment { month: number; kind: Kind; amount: number | null; sumitAmount: number | null; statusId: string | null }

const MONTHS_FULL = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

function eff(p?: Payment): number {
  if (!p) return 0;
  return p.amount ?? p.sumitAmount ?? 0;
}

export default function MyPaymentsView() {
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(nowYear);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ statuses: Status[]; payments: Payment[] }>(`/api/my-payments?year=${year}`);
      setStatuses(d.statuses);
      setPayments(d.payments);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const paidIds = useMemo(() => new Set(statuses.filter((s) => s.isPaid).map((s) => s.id)), [statuses]);

  // בניית שורה לכל חודש: ריטיינר + חד-פעמי.
  const rows = useMemo(() => {
    const byMonth = new Map<number, { retainer?: Payment; oneoff?: Payment }>();
    for (const p of payments) {
      const slot = byMonth.get(p.month) || {};
      slot[p.kind] = p;
      byMonth.set(p.month, slot);
    }
    return byMonth;
  }, [payments]);

  const totals = useMemo(() => {
    let expected = 0, collected = 0, retainer = 0, oneoff = 0;
    for (const p of payments) {
      const amt = eff(p);
      if (!amt) continue;
      expected += amt;
      if (p.kind === "retainer") retainer += amt; else oneoff += amt;
      if (p.statusId && paidIds.has(p.statusId)) collected += amt;
    }
    return { expected, collected, pending: expected - collected, retainer, oneoff };
  }, [payments, paidIds]);

  function StatusBadge({ id }: { id: string | null }) {
    if (!id) return <span className="text-slate-300">—</span>;
    const s = statusById.get(id);
    if (!s) return <span className="text-slate-300">—</span>;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${s.color}1a`, color: s.color }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
        {s.name}
      </span>
    );
  }

  const hasAny = payments.some((p) => eff(p) > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 self-start rounded-xl border border-slate-200 bg-white p-1">
        <button onClick={() => setYear((y) => y - 1)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">‹</button>
        <span className="min-w-16 text-center text-sm font-bold text-slate-800">{year}</span>
        <button onClick={() => setYear((y) => y + 1)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">›</button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="ריטיינר (שנה)" value={totals.retainer} color="#3a5bd9" />
        <Tile label="חד-פעמי (שנה)" value={totals.oneoff} color="#f59e0b" />
        <Tile label="שולם" value={totals.collected} color="#10b981" />
        <Tile label="ממתין" value={totals.pending} color="#ef4444" />
      </div>

      <Card className="!p-0">
        {loading ? (
          <p className="p-6 text-center text-sm text-slate-500">טוען…</p>
        ) : !hasAny ? (
          <p className="p-6 text-center text-sm text-slate-500">אין תשלומים רשומים לשנה זו.</p>
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">חודש</th>
                  <th className="px-3 py-2 font-medium">ריטיינר</th>
                  <th className="px-3 py-2 font-medium">סטטוס</th>
                  <th className="px-3 py-2 font-medium">חד-פעמי</th>
                  <th className="px-3 py-2 font-medium">סטטוס</th>
                  <th className="px-3 py-2 text-center font-medium">סה״כ</th>
                </tr>
              </thead>
              <tbody>
                {MONTHS_FULL.map((mName, i) => {
                  const slot = rows.get(i + 1);
                  const r = slot?.retainer;
                  const o = slot?.oneoff;
                  const rAmt = eff(r);
                  const oAmt = eff(o);
                  if (!rAmt && !oAmt) return null;
                  return (
                    <tr key={mName} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-700">{mName}</td>
                      <td className="px-3 py-2 font-mono text-slate-800">{rAmt ? formatCurrency(rAmt) : "—"}</td>
                      <td className="px-3 py-2"><StatusBadge id={r?.statusId ?? null} /></td>
                      <td className="px-3 py-2 font-mono text-slate-800">{oAmt ? formatCurrency(oAmt) : "—"}</td>
                      <td className="px-3 py-2"><StatusBadge id={o?.statusId ?? null} /></td>
                      <td className="px-3 py-2 text-center font-mono font-bold text-slate-800">{formatCurrency(rAmt + oAmt)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                  <td className="px-3 py-2 text-slate-700">סה״כ שנה</td>
                  <td className="px-3 py-2 font-mono text-slate-700">{formatCurrency(totals.retainer)}</td>
                  <td />
                  <td className="px-3 py-2 font-mono text-slate-700">{formatCurrency(totals.oneoff)}</td>
                  <td />
                  <td className="px-3 py-2 text-center font-mono text-slate-900">{formatCurrency(totals.expected)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Tile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <div className="text-2xl font-bold tabular-nums text-slate-900">{formatCurrency(value)}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
