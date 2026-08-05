"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart } from "@tremor/react";
import { api } from "@/lib/fetcher";
import { formatCurrency } from "@/lib/format";
import { Button, Card } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface Client { id: string; name: string; color: string | null }
interface Status { id: string; name: string; color: string; order: number; isPaid: boolean }
interface Cell { amount: number | null; statusId: string | null; note: string | null }

const MONTHS = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];

function hexTint(hex: string, alpha = "22"): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alpha}` : "#f1f5f9";
}

export default function PaymentsBoard() {
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(nowYear);
  const [clients, setClients] = useState<Client[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [cells, setCells] = useState<Record<string, Record<number, Cell>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showStatusMgr, setShowStatusMgr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = await api<{ clients: Client[]; statuses: Status[]; payments: { clientId: string; month: number; amount: number | null; statusId: string | null; note: string | null }[] }>(
        `/api/payments?year=${year}`
      );
      setClients(d.clients);
      setStatuses(d.statuses);
      const map: Record<string, Record<number, Cell>> = {};
      for (const p of d.payments) {
        (map[p.clientId] ??= {})[p.month] = { amount: p.amount, statusId: p.statusId, note: p.note };
      }
      setCells(map);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [year]);
  useEffect(() => {
    load();
  }, [load]);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const paidIds = useMemo(() => new Set(statuses.filter((s) => s.isPaid).map((s) => s.id)), [statuses]);

  // חישוב מקומי (אופטימיסטי) של הסטטיסטיקות מהתאים הנוכחיים.
  const stats = useMemo(() => {
    const byMonth = MONTHS.map((m, i) => ({ month: m, "צפוי": 0, "נגבה": 0 }));
    const byStatus = new Map<string, number>();
    let totalExpected = 0;
    let totalCollected = 0;
    for (const clientId of Object.keys(cells)) {
      for (const mo of Object.keys(cells[clientId])) {
        const c = cells[clientId][Number(mo)];
        const amt = c.amount || 0;
        if (!amt) continue;
        totalExpected += amt;
        byMonth[Number(mo) - 1]["צפוי"] += amt;
        if (c.statusId && paidIds.has(c.statusId)) {
          totalCollected += amt;
          byMonth[Number(mo) - 1]["נגבה"] += amt;
        }
        if (c.statusId) byStatus.set(c.statusId, (byStatus.get(c.statusId) || 0) + amt);
      }
    }
    return { byMonth, byStatus, totalExpected, totalCollected, totalPending: totalExpected - totalCollected };
  }, [cells, paidIds]);

  function setCell(clientId: string, month: number, patch: Partial<Cell>) {
    setCells((prev) => {
      const next = { ...prev };
      const row = { ...(next[clientId] || {}) };
      const base: Cell = row[month] || { amount: null, statusId: null, note: null };
      row[month] = { ...base, ...patch };
      next[clientId] = row;
      return next;
    });
  }

  async function saveCell(clientId: string, month: number) {
    const c = cells[clientId]?.[month] || { amount: null, statusId: null, note: null };
    try {
      await api("/api/payments", {
        method: "POST",
        json: { clientId, year, month, amount: c.amount, statusId: c.statusId, note: c.note },
      });
    } catch (e: any) {
      setError(e.message);
    }
  }

  const clientTotal = (clientId: string) =>
    Object.values(cells[clientId] || {}).reduce((s, c) => s + (c.amount || 0), 0);
  const monthTotal = (month: number) =>
    Object.keys(cells).reduce((s, cid) => s + (cells[cid]?.[month]?.amount || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {/* בקרת שנה */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <button onClick={() => setYear((y) => y - 1)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">‹</button>
          <span className="min-w-16 text-center text-sm font-bold text-slate-800">{year}</span>
          <button onClick={() => setYear((y) => y + 1)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">›</button>
        </div>
        <Button variant="ghost" onClick={() => setShowStatusMgr((s) => !s)}>
          <Icon name="edit" className="h-4 w-4" />
          ניהול סטטוסים
        </Button>
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>

      {/* סטטיסטיקות */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="סה״כ צפוי (שנה)" value={stats.totalExpected} color="#3a5bd9" />
        <StatTile label="נגבה" value={stats.totalCollected} color="#10b981" />
        <StatTile label="ממתין לגבייה" value={stats.totalPending} color="#f59e0b" />
      </div>

      {/* גרפים */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="mb-2 text-sm font-bold text-slate-800">תזרים חודשי — צפוי מול נגבה</h3>
          <BarChart
            data={stats.byMonth}
            index="month"
            categories={["צפוי", "נגבה"]}
            colors={["blue", "emerald"]}
            valueFormatter={(n) => `₪${Math.round(n).toLocaleString()}`}
            yAxisWidth={64}
            className="h-64"
          />
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-bold text-slate-800">פילוח לפי סטטוס</h3>
          <div className="flex flex-col gap-2">
            {statuses.map((s) => {
              const total = stats.byStatus.get(s.id) || 0;
              const pct = stats.totalExpected ? Math.round((total / stats.totalExpected) * 100) : 0;
              return (
                <div key={s.id}>
                  <div className="mb-0.5 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                      {s.name}
                    </span>
                    <span className="font-mono text-slate-600">{formatCurrency(total)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: s.color }} />
                  </div>
                </div>
              );
            })}
            {statuses.length === 0 ? <p className="text-xs text-slate-500">אין סטטוסים.</p> : null}
          </div>
        </Card>
      </div>

      {showStatusMgr ? <StatusManager statuses={statuses} onChange={load} /> : null}

      {/* טבלת התשלומים */}
      <Card className="!p-0">
        {loading ? (
          <p className="p-6 text-center text-sm text-slate-500">טוען…</p>
        ) : clients.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">אין לקוחות פעילים.</p>
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full border-collapse text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="sticky right-0 z-10 min-w-[160px] bg-slate-50 px-3 py-2 text-slate-600">לקוח</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="min-w-[92px] px-2 py-2 text-center font-medium text-slate-500">{m}</th>
                  ))}
                  <th className="min-w-[90px] px-2 py-2 text-center text-slate-600">סה״כ</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((cl) => (
                  <tr key={cl.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="sticky right-0 z-10 bg-white px-3 py-1.5 font-medium text-slate-800">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cl.color ?? "#94a3b8" }} />
                        <span className="truncate">{cl.name}</span>
                      </span>
                    </td>
                    {MONTHS.map((_, i) => {
                      const month = i + 1;
                      const c = cells[cl.id]?.[month];
                      const st = c?.statusId ? statusById.get(c.statusId) : null;
                      return (
                        <td key={month} className="px-1 py-1 align-top" style={{ background: st ? hexTint(st.color) : undefined }}>
                          <input
                            type="number"
                            value={c?.amount ?? ""}
                            onChange={(e) => setCell(cl.id, month, { amount: e.target.value === "" ? null : Number(e.target.value) })}
                            onBlur={() => saveCell(cl.id, month)}
                            placeholder="—"
                            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-[11px] text-slate-800 hover:border-slate-300 focus:border-[#3a5bd9] focus:bg-white focus:outline-none"
                          />
                          <select
                            value={c?.statusId ?? ""}
                            onChange={(e) => { setCell(cl.id, month, { statusId: e.target.value || null }); setTimeout(() => saveCell(cl.id, month), 0); }}
                            className="mt-0.5 w-full rounded border-0 bg-transparent text-center text-[10px] text-slate-600 focus:outline-none"
                            style={{ color: st?.color }}
                          >
                            <option value="">—</option>
                            {statuses.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-center font-mono font-bold text-slate-800">
                      {clientTotal(cl.id) ? formatCurrency(clientTotal(cl.id)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                  <td className="sticky right-0 z-10 bg-slate-50 px-3 py-2 text-slate-700">סה״כ חודשי</td>
                  {MONTHS.map((_, i) => (
                    <td key={i} className="px-1 py-2 text-center font-mono text-[11px] text-slate-700">
                      {monthTotal(i + 1) ? formatCurrency(monthTotal(i + 1)) : "—"}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center font-mono text-slate-900">{formatCurrency(stats.totalExpected)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <div className="text-2xl font-bold tabular-nums text-slate-900">{formatCurrency(value)}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}

const PALETTE = ["#3a5bd9", "#06b6d4", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#64748b"];

function StatusManager({ statuses, onChange }: { statuses: Status[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [isPaid, setIsPaid] = useState(false);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api("/api/payment-statuses", { method: "POST", json: { name: name.trim(), color, isPaid } });
      setName("");
      setIsPaid(false);
      onChange();
    } finally {
      setBusy(false);
    }
  }
  async function togglePaid(s: Status) {
    await api(`/api/payment-statuses/${s.id}`, { method: "PATCH", json: { isPaid: !s.isPaid } });
    onChange();
  }
  async function remove(s: Status) {
    if (!confirm(`למחוק את הסטטוס "${s.name}"? תאים שהשתמשו בו יאבדו את הסטטוס.`)) return;
    await api(`/api/payment-statuses/${s.id}`, { method: "DELETE" });
    onChange();
  }

  return (
    <Card>
      <h3 className="mb-3 text-sm font-bold text-slate-800">ניהול סטטוסי תשלום</h3>
      <div className="flex flex-col gap-2">
        {statuses.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
            <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
            <span className="text-sm text-slate-700">{s.name}</span>
            <label className="mr-auto flex items-center gap-1 text-[11px] text-slate-500">
              <input type="checkbox" checked={s.isPaid} onChange={() => togglePaid(s)} className="h-3.5 w-3.5" />
              נחשב כ״נגבה״
            </label>
            <button onClick={() => remove(s)} className="rounded p-1 text-slate-400 hover:text-red-600" title="מחיקה">
              <Icon name="trash" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם סטטוס חדש"
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-[#3a5bd9] focus:outline-none"
        />
        <div className="flex items-center gap-1">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full ${color === c ? "ring-2 ring-offset-1 ring-slate-400" : ""}`}
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} className="h-3.5 w-3.5" />
          נחשב כ״נגבה״
        </label>
        <Button size="sm" disabled={busy || !name.trim()} onClick={add}>הוספה</Button>
      </div>
    </Card>
  );
}
