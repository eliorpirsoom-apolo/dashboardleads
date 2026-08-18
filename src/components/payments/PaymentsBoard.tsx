"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { BarChart } from "@tremor/react";
import { api } from "@/lib/fetcher";
import { formatCurrency } from "@/lib/format";
import { Button, Card } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface Client { id: string; name: string; color: string | null }
interface Status { id: string; name: string; color: string; order: number; isPaid: boolean }
interface Keyword { id: string; keyword: string; kind: Kind }
interface Cell { amount: number | null; sumitAmount: number | null; statusId: string | null; note: string | null }

type Kind = "retainer" | "oneoff";
const KINDS: { key: Kind; label: string }[] = [
  { key: "retainer", label: "ריטיינר" },
  { key: "oneoff", label: "חד-פעמי" },
];

const MONTHS = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];
const MONTHS_FULL = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

// סכום אפקטיבי: דריסה ידנית גוברת על הסכום האוטומטי מ-SUMIT.
function eff(c?: Cell | null): number | null {
  if (!c) return null;
  return c.amount ?? c.sumitAmount ?? null;
}

function hexTint(hex: string, alpha = "22"): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alpha}` : "#f1f5f9";
}

type CellMap = Record<string, Record<number, Partial<Record<Kind, Cell>>>>;

export default function PaymentsBoard() {
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(nowYear);
  const [month, setMonth] = useState(0); // 0 = כל השנה, 1-12 = חודש ספציפי
  const [clients, setClients] = useState<Client[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [cells, setCells] = useState<CellMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"" | "status" | "keywords">("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = await api<{
        clients: Client[];
        statuses: Status[];
        payments: { clientId: string; month: number; kind: Kind; amount: number | null; sumitAmount: number | null; statusId: string | null; note: string | null }[];
      }>(`/api/payments?year=${year}`);
      setClients(d.clients);
      setStatuses(d.statuses);
      const map: CellMap = {};
      for (const p of d.payments) {
        const kind: Kind = p.kind === "oneoff" ? "oneoff" : "retainer";
        ((map[p.clientId] ??= {})[p.month] ??= {})[kind] = {
          amount: p.amount,
          sumitAmount: p.sumitAmount,
          statusId: p.statusId,
          note: p.note,
        };
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

  // חישוב מקומי (אופטימיסטי). הגרף תמיד 12 חודשים; שאר הסטטיסטיקות ממוקדות לחודש הנבחר (0 = כל השנה).
  const stats = useMemo(() => {
    const byMonth = MONTHS.map((m) => ({ month: m, "ריטיינר": 0, "חד-פעמי": 0 }));
    const byStatus = new Map<string, number>();
    let rExp = 0, rCol = 0, oExp = 0, oCol = 0, yearTotal = 0;
    for (const clientId of Object.keys(cells)) {
      for (const mo of Object.keys(cells[clientId])) {
        const mNum = Number(mo);
        for (const k of KINDS) {
          const c = cells[clientId][mNum][k.key];
          const amt = eff(c) || 0;
          if (!amt || !c) continue;
          const paid = !!(c.statusId && paidIds.has(c.statusId));
          yearTotal += amt;
          byMonth[mNum - 1][k.key === "retainer" ? "ריטיינר" : "חד-פעמי"] += amt;
          if (month === 0 || mNum === month) {
            if (k.key === "retainer") { rExp += amt; if (paid) rCol += amt; }
            else { oExp += amt; if (paid) oCol += amt; }
            if (c.statusId) byStatus.set(c.statusId, (byStatus.get(c.statusId) || 0) + amt);
          }
        }
      }
    }
    const totalExpected = rExp + oExp;
    const totalCollected = rCol + oCol;
    return {
      byMonth, byStatus, yearTotal,
      retainerExpected: rExp, oneoffExpected: oExp,
      totalExpected, totalCollected, totalPending: totalExpected - totalCollected,
    };
  }, [cells, paidIds, month]);

  const scopeLabel = month === 0 ? "שנה" : MONTHS_FULL[month - 1];

  function setCell(clientId: string, mNum: number, kind: Kind, patch: Partial<Cell>) {
    setCells((prev) => {
      const next = { ...prev };
      const row = { ...(next[clientId] || {}) };
      const monthCell = { ...(row[mNum] || {}) };
      const base: Cell = monthCell[kind] || { amount: null, sumitAmount: null, statusId: null, note: null };
      monthCell[kind] = { ...base, ...patch };
      row[mNum] = monthCell;
      next[clientId] = row;
      return next;
    });
  }

  // patch מועבר במפורש כשנשמר מיד אחרי שינוי (סטטוס) — קריאת ה-state כאן
  // רואה את הרינדור הקודם, ובלי ה-patch נשלח לשרת הערך הישן והשינוי "נעלם".
  async function saveCell(clientId: string, mNum: number, kind: Kind, patch?: Partial<Cell>) {
    const base = cells[clientId]?.[mNum]?.[kind] || { amount: null, sumitAmount: null, statusId: null, note: null };
    const c = { ...base, ...patch };
    try {
      await api("/api/payments", {
        method: "POST",
        json: { clientId, year, month: mNum, kind, amount: c.amount, statusId: c.statusId, note: c.note },
      });
    } catch (e: any) {
      setError(e.message);
    }
  }

  const rowTotal = (clientId: string, kind: Kind) =>
    Object.values(cells[clientId] || {}).reduce((s, mc) => s + (eff(mc[kind]) || 0), 0);
  const monthTotal = (mNum: number) =>
    Object.keys(cells).reduce((s, cid) => {
      const mc = cells[cid]?.[mNum];
      return s + (eff(mc?.retainer) || 0) + (eff(mc?.oneoff) || 0);
    }, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* בקרת שנה + חודש */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <button onClick={() => setYear((y) => y - 1)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">‹</button>
          <span className="min-w-16 text-center text-sm font-bold text-slate-800">{year}</span>
          <button onClick={() => setYear((y) => y + 1)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">›</button>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-[#3a5bd9] focus:outline-none"
          title="סינון לפי חודש"
        >
          <option value={0}>כל השנה</option>
          {MONTHS_FULL.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <Button variant="ghost" onClick={() => setPanel((p) => (p === "status" ? "" : "status"))}>
          <Icon name="edit" className="h-4 w-4" />
          ניהול סטטוסים
        </Button>
        <Button variant="ghost" onClick={() => setPanel((p) => (p === "keywords" ? "" : "keywords"))}>
          <Icon name="edit" className="h-4 w-4" />
          מילות סיווג
        </Button>
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>

      {/* סטטיסטיקות — מופרד ריטיינר/חד-פעמי */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={`ריטיינר — צפוי (${scopeLabel})`} value={stats.retainerExpected} color="#3a5bd9" />
        <StatTile label={`חד-פעמי — צפוי (${scopeLabel})`} value={stats.oneoffExpected} color="#f59e0b" />
        <StatTile label={`נגבה (${scopeLabel})`} value={stats.totalCollected} color="#10b981" />
        <StatTile label={`ממתין לגבייה (${scopeLabel})`} value={stats.totalPending} color="#ef4444" />
      </div>

      {/* גרפים */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="mb-2 text-sm font-bold text-slate-800">
            תזרים חודשי — ריטיינר מול חד-פעמי <span className="text-xs font-normal text-slate-400">(כל השנה)</span>
          </h3>
          <BarChart
            data={stats.byMonth}
            index="month"
            categories={["ריטיינר", "חד-פעמי"]}
            colors={["blue", "amber"]}
            stack
            valueFormatter={(n) => `₪${Math.round(n).toLocaleString()}`}
            yAxisWidth={64}
            className="h-64"
          />
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-bold text-slate-800">פילוח לפי סטטוס <span className="text-xs font-normal text-slate-400">({scopeLabel})</span></h3>
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

      {panel === "status" ? <StatusManager statuses={statuses} onChange={load} /> : null}
      {panel === "keywords" ? <KeywordManager /> : null}
      {/* טבלת התשלומים — שתי תת-שורות לכל לקוח (ריטיינר / חד-פעמי) */}
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
                  <th className="sticky right-0 z-10 min-w-[150px] bg-slate-50 px-3 py-2 text-slate-600">לקוח</th>
                  <th className="min-w-[70px] bg-slate-50 px-2 py-2 text-slate-500">סוג</th>
                  {MONTHS.map((m, i) => (
                    <th
                      key={m}
                      className={`min-w-[90px] px-2 py-2 text-center font-medium ${month === i + 1 ? "bg-[#3a5bd9]/10 text-[#3a5bd9]" : "text-slate-500"}`}
                    >
                      {m}
                    </th>
                  ))}
                  <th className="min-w-[90px] px-2 py-2 text-center text-slate-600">סה״כ</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((cl) => (
                  <Fragment key={cl.id}>
                    {KINDS.map((k, ki) => (
                      <tr key={k.key} className={`hover:bg-slate-50/50 ${ki === KINDS.length - 1 ? "border-b border-slate-200" : ""}`}>
                        {ki === 0 ? (
                          <td rowSpan={KINDS.length} className="sticky right-0 z-10 border-l border-slate-100 bg-white px-3 py-1.5 align-top font-medium text-slate-800">
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cl.color ?? "#94a3b8" }} />
                              <span className="truncate">{cl.name}</span>
                            </span>
                          </td>
                        ) : null}
                        <td className="whitespace-nowrap px-2 py-1 text-[11px] font-medium text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: k.key === "retainer" ? "#3a5bd9" : "#f59e0b" }} />
                            {k.label}
                          </span>
                        </td>
                        {MONTHS.map((_, i) => {
                          const mNum = i + 1;
                          const c = cells[cl.id]?.[mNum]?.[k.key];
                          const st = c?.statusId ? statusById.get(c.statusId) : null;
                          const selected = month === mNum;
                          const isAuto = c?.amount == null && c?.sumitAmount != null;
                          return (
                            <td
                              key={mNum}
                              className={`px-1 py-1 align-top ${selected ? "ring-1 ring-inset ring-[#3a5bd9]/30" : ""}`}
                              style={{ background: st ? hexTint(st.color) : selected ? "#3a5bd90d" : undefined }}
                            >
                              <input
                                type="number"
                                value={c?.amount ?? c?.sumitAmount ?? ""}
                                onChange={(e) => setCell(cl.id, mNum, k.key, { amount: e.target.value === "" ? null : Number(e.target.value) })}
                                onBlur={() => saveCell(cl.id, mNum, k.key)}
                                placeholder="—"
                                title={isAuto ? "סכום אוטומטי מ-SUMIT — הקלדה תדרוס ידנית" : undefined}
                                className={`w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-[11px] hover:border-slate-300 focus:border-[#3a5bd9] focus:bg-white focus:outline-none ${isAuto ? "italic text-slate-500" : "text-slate-800"}`}
                              />
                              <select
                                value={c?.statusId ?? ""}
                                onChange={(e) => {
                                  const statusId = e.target.value || null;
                                  setCell(cl.id, mNum, k.key, { statusId });
                                  saveCell(cl.id, mNum, k.key, { statusId });
                                }}
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
                          {rowTotal(cl.id, k.key) ? formatCurrency(rowTotal(cl.id, k.key)) : "—"}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                  <td colSpan={2} className="sticky right-0 z-10 bg-slate-50 px-3 py-2 text-slate-700">סה״כ חודשי</td>
                  {MONTHS.map((_, i) => (
                    <td
                      key={i}
                      className={`px-1 py-2 text-center font-mono text-[11px] ${month === i + 1 ? "bg-[#3a5bd9]/10 text-[#3a5bd9]" : "text-slate-700"}`}
                    >
                      {monthTotal(i + 1) ? formatCurrency(monthTotal(i + 1)) : "—"}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center font-mono text-slate-900">{formatCurrency(stats.yearTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* התראות הנה"ח — כרטיס קבוע מתחת ללוח, ניתן למזעור/הרחבה */}
      <BillingAlertsPanel />
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

// ניהול מילות הסיווג לחשבוניות SUMIT — לריטיינר ולחד-פעמי.
function KeywordManager() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Kind>("retainer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ keywords: Keyword[] }>("/api/payment-keywords");
      setKeywords(d.keywords);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/payment-keywords", { method: "POST", json: { keyword: text.trim(), kind } });
      setText("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    await api(`/api/payment-keywords/${id}`, { method: "DELETE" });
    load();
  }

  const groups: { key: Kind; label: string; color: string }[] = [
    { key: "retainer", label: "ריטיינר", color: "#3a5bd9" },
    { key: "oneoff", label: "חד-פעמי", color: "#f59e0b" },
  ];

  return (
    <Card>
      <h3 className="mb-1 text-sm font-bold text-slate-800">מילות סיווג לחשבוניות SUMIT</h3>
      <p className="mb-3 text-xs text-slate-500">
        כשמונפקת חשבונית, המערכת בודקת אם תיאור הפריטים מכיל אחת מהמילים ומסווגת לריטיינר או חד-פעמי בהתאם.
      </p>
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
              {g.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {keywords.filter((k) => k.kind === g.key).map((k) => (
                <span key={k.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700">
                  {k.keyword}
                  <button onClick={() => remove(k.id)} className="text-slate-400 hover:text-red-600" title="הסרה">×</button>
                </span>
              ))}
              {keywords.filter((k) => k.kind === g.key).length === 0 ? (
                <span className="text-[11px] text-slate-400">אין מילים.</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="מילת מפתח חדשה"
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-[#3a5bd9] focus:outline-none"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-[#3a5bd9] focus:outline-none"
        >
          <option value="retainer">ריטיינר</option>
          <option value="oneoff">חד-פעמי</option>
        </select>
        <Button size="sm" disabled={busy || !text.trim()} onClick={add}>הוספה</Button>
      </div>
    </Card>
  );
}

// פאנל התראות הנהלת חשבונות: איש קשר + ערוץ + יום התראה חודשית, ותזכורות ידניות.
function BillingAlertsPanel() {
  interface BillingConfig {
    enabled: boolean;
    contactPhone: string | null;
    contactEmail: string | null;
    channel: "whatsapp" | "email" | "both";
    alertDay: number;
  }
  interface BillingReminder {
    id: string;
    text: string;
    dueOn: string;
    sentAt: string | null;
    createdByName: string | null;
  }
  const [cfg, setCfg] = useState<BillingConfig | null>(null);
  const [reminders, setReminders] = useState<BillingReminder[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [newText, setNewText] = useState("");
  const [newDate, setNewDate] = useState("");
  // ממוזער כברירת מחדל; הבחירה נשמרת מקומית.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("billing-panel-open") === "1";
    return false;
  });
  function toggleOpen() {
    setOpen((v) => {
      try { localStorage.setItem("billing-panel-open", v ? "0" : "1"); } catch { /* לא קריטי */ }
      return !v;
    });
  }

  const loadAll = useCallback(async () => {
    const d = await api<{ config: BillingConfig; reminders: BillingReminder[] }>("/api/billing-alerts");
    setCfg(d.config);
    setReminders(d.reminders);
  }, []);
  // נטען רק כשהכרטיס נפתח לראשונה.
  useEffect(() => { if (open && !cfg) loadAll(); }, [open, cfg, loadAll]);

  async function save(patch: Record<string, unknown>) {
    setMsg("");
    try {
      const d = await api<{ config: BillingConfig }>("/api/billing-alerts", { method: "PATCH", json: patch });
      setCfg(d.config);
      setMsg("נשמר ✓");
    } catch (e: any) { setMsg("שגיאה: " + e.message); }
  }

  async function addReminder() {
    if (!newText.trim() || !newDate) return;
    setBusy(true);
    setMsg("");
    try {
      await api("/api/billing-alerts", { method: "POST", json: { text: newText.trim(), dueOn: newDate } });
      setNewText("");
      setNewDate("");
      loadAll();
    } catch (e: any) { setMsg("שגיאה: " + e.message); } finally { setBusy(false); }
  }

  async function delReminder(id: string) {
    await api(`/api/billing-alerts/${id}`, { method: "DELETE" }).catch(() => {});
    loadAll();
  }

  async function sendTest() {
    if (!confirm("לשלוח עכשיו דוח אי-תשלום לבדיקה לאיש הקשר שהוגדר?")) return;
    setBusy(true);
    setMsg("");
    try {
      await api("/api/billing-alerts", { method: "POST", json: { test: true } });
      setMsg("נשלחה בדיקה ✓ (בדקו את הוואטסאפ/מייל של איש הקשר)");
    } catch (e: any) { setMsg("שגיאה: " + e.message); } finally { setBusy(false); }
  }

  const inputCls = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-[#3a5bd9] focus:outline-none";
  const fmtDate = (iso: string) => new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

  const header = (
    <button type="button" onClick={toggleOpen} className="flex w-full items-center justify-between text-right">
      <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
        🔔 התראות הנהלת חשבונות
        {cfg ? (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.enabled ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
            {cfg.enabled ? "מופעל" : "כבוי"}
          </span>
        ) : null}
      </span>
      <span className="text-slate-400">{open ? "▾ מזעור" : "▸ הרחבה"}</span>
    </button>
  );

  if (!open) return <Card>{header}</Card>;
  if (!cfg) return <Card>{header}<p className="p-4 text-center text-sm text-slate-500">טוען…</p></Card>;

  return (
    <Card>
      <div className="mb-3">{header}</div>
      <div className="mb-3 flex items-center justify-end">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => save({ enabled: e.target.checked })} className="h-4 w-4 accent-[#3a5bd9]" />
          מופעל
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          וואטסאפ של הנה״ח
          <input dir="ltr" className={inputCls} placeholder="0501234567" defaultValue={cfg.contactPhone ?? ""} onBlur={(e) => e.target.value !== (cfg.contactPhone ?? "") && save({ contactPhone: e.target.value || null })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          מייל של הנה״ח
          <input dir="ltr" type="email" className={inputCls} placeholder="billing@..." defaultValue={cfg.contactEmail ?? ""} onBlur={(e) => e.target.value !== (cfg.contactEmail ?? "") && save({ contactEmail: e.target.value || null })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          לאן שולחים
          <select className={inputCls} value={cfg.channel} onChange={(e) => save({ channel: e.target.value })}>
            <option value="whatsapp">וואטסאפ</option>
            <option value="email">מייל</option>
            <option value="both">גם וגם</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          התראת אי-תשלום מיום בחודש
          <select className={inputCls} value={cfg.alertDay} onChange={(e) => save({ alertDay: Number(e.target.value) })}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (<option key={d} value={d}>{d} בחודש</option>))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        פעם בחודש, ביום שנבחר, נשלחת אוטומטית רשימת כל הלקוחות שעדיין לא סומנו בסטטוס ״שולם״ בריטיינר של החודש
        (כולל לקוחות ריטיינר שטרם נרשמה להם חשבונית החודש).
      </p>
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" variant="ghost" disabled={busy || (!cfg.contactPhone && !cfg.contactEmail)} onClick={sendTest}>שליחת דוח בדיקה עכשיו</Button>
        {msg ? <span className="text-xs text-slate-500">{msg}</span> : null}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <h4 className="mb-2 text-xs font-bold text-slate-700">תזכורות ידניות (למשל: ״לחייב את הלקוח באשראי ב-23 לחודש״)</h4>
        <div className="flex flex-wrap items-end gap-2">
          <input className={`${inputCls} min-w-64 flex-1`} placeholder="מה להזכיר להנהלת החשבונות?" value={newText} onChange={(e) => setNewText(e.target.value)} />
          <input type="date" dir="ltr" className={inputCls} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <Button size="sm" disabled={busy || !newText.trim() || !newDate} onClick={addReminder}>הוספה</Button>
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {reminders.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-medium ${r.sentAt ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                {r.sentAt ? "נשלחה" : "ממתינה"}
              </span>
              <span dir="ltr" className="font-mono text-slate-500">{fmtDate(r.dueOn)}</span>
              <span className="flex-1 text-slate-700">{r.text}</span>
              {r.createdByName ? <span className="text-slate-400">{r.createdByName}</span> : null}
              <button onClick={() => delReminder(r.id)} title="מחיקה" className="text-slate-400 transition hover:text-rose-500">
                <Icon name="trash" className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {reminders.length === 0 ? <p className="text-[11px] text-slate-500">אין תזכורות עדיין.</p> : null}
        </div>
      </div>
    </Card>
  );
}
