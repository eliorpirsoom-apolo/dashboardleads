"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

// גאנט חודשי: 6 חודשים × 4 שבועות = 24 עמודות. תא בלחיצה מתחלף:
// ריק → מתוכנן → בוצע → ריק. המשרד עורך, הלקוח צופה.

const MONTHS = 6;
const WEEKS_PER_MONTH = 4;
const TOTAL = MONTHS * WEEKS_PER_MONTH; // 24
const HEB_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const COLORS = ["#22d3ee", "#a78bfa", "#f59e0b", "#34d399", "#f472b6", "#fb923c", "#38bdf8"];

interface GRow {
  id: string;
  title: string;
  ownerName: string | null;
  color: string;
  order: number;
  weeks: Record<string, string>;
}
interface Plan {
  id: string;
  startMonth: string; // YYYY-MM
  tasks: GRow[];
}

function monthLabel(startMonth: string, offset: number): string {
  const [y, m] = startMonth.split("-").map(Number);
  const idx = (m - 1 + offset) % 12;
  const year = y + Math.floor((m - 1 + offset) / 12);
  return `${HEB_MONTHS[idx]} ${String(year).slice(2)}`;
}

export default function GanttBoard({
  clientId,
  canEdit,
}: {
  clientId: string;
  canEdit: boolean;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [showRow, setShowRow] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ plan: Plan | null }>(`/api/gantt?clientId=${clientId}`);
      setPlan(d.plan);
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  // מחזור סטטוס תא: "" → planned → done → ""
  async function cycleCell(row: GRow, week: number) {
    if (!canEdit) return;
    const cur = row.weeks[String(week)] ?? "";
    const next = cur === "" ? "planned" : cur === "planned" ? "done" : "";
    // עדכון אופטימי
    setPlan((p) =>
      p
        ? {
            ...p,
            tasks: p.tasks.map((t) =>
              t.id === row.id
                ? { ...t, weeks: { ...t.weeks, [String(week)]: next || undefined } as any }
                : t
            ),
          }
        : p
    );
    await api(`/api/gantt/tasks/${row.id}`, {
      method: "PATCH",
      json: { setCell: { week, status: next } },
    });
  }

  async function setStartMonth(startMonth: string) {
    await api("/api/gantt", { method: "PATCH", json: { clientId, startMonth } });
    load();
  }
  async function removeRow(row: GRow) {
    if (!confirm(`למחוק את השורה "${row.title}"?`)) return;
    await api(`/api/gantt/tasks/${row.id}`, { method: "DELETE" });
    load();
  }

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!plan) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-slate-500">
          עדיין אין תוכנית גאנט. {canEdit ? "הוסיפו שורה ראשונה כדי להתחיל." : "המשרד יגדיר את התוכנית בקרוב."}
        </p>
        {canEdit ? (
          <div className="flex justify-center">
            <Button onClick={() => setShowRow(true)}>
              <Icon name="plus" className="h-4 w-4" />
              שורה ראשונה
            </Button>
          </div>
        ) : null}
        {showRow ? (
          <AddRowModal planId="" clientId={clientId} onClose={() => setShowRow(false)} onAdded={load} />
        ) : null}
      </Card>
    );
  }

  const colW = 34; // px per week column
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? (
          <Field label="חודש התחלה">
            <Input
              type="month"
              dir="ltr"
              value={plan.startMonth}
              onChange={(e) => e.target.value && setStartMonth(e.target.value)}
              className="!w-40 !py-1 text-xs"
            />
          </Field>
        ) : (
          <span className="text-xs text-slate-500">
            תוכנית 6 חודשים · החל מ-{monthLabel(plan.startMonth, 0)}
          </span>
        )}
        <span className="flex-1" />
        <span className="flex items-center gap-1 text-[11px] text-slate-500">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#22d3ee55", border: "1px solid #22d3ee" }} /> מתוכנן
        </span>
        <span className="flex items-center gap-1 text-[11px] text-slate-500">
          <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" /> בוצע
        </span>
        {canEdit ? (
          <Button size="sm" onClick={() => setShowRow(true)}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            שורה
          </Button>
        ) : null}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="border-collapse text-xs" style={{ minWidth: 220 + TOTAL * colW }}>
          <thead>
            {/* חודשים */}
            <tr>
              <th className="sticky right-0 z-10 bg-slate-950/80 px-3 py-1.5 text-right font-medium text-slate-400" style={{ width: 220 }}>
                משימה / תוצר
              </th>
              {Array.from({ length: MONTHS }, (_, m) => (
                <th
                  key={m}
                  colSpan={WEEKS_PER_MONTH}
                  className="border-r border-slate-800 px-1 py-1.5 text-center font-bold text-slate-300"
                >
                  {monthLabel(plan.startMonth, m)}
                </th>
              ))}
            </tr>
            {/* שבועות */}
            <tr className="text-[10px] text-slate-600">
              <th className="sticky right-0 z-10 bg-slate-950/80" />
              {Array.from({ length: TOTAL }, (_, i) => (
                <th
                  key={i}
                  className={`py-1 text-center ${i % WEEKS_PER_MONTH === 0 ? "border-r border-slate-800" : ""}`}
                  style={{ width: colW }}
                >
                  {(i % WEEKS_PER_MONTH) + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.tasks.length === 0 ? (
              <tr>
                <td colSpan={TOTAL + 1} className="py-6 text-center text-slate-600">
                  אין שורות עדיין
                </td>
              </tr>
            ) : (
              plan.tasks.map((row) => (
                <tr key={row.id} className="border-t border-slate-800/60">
                  <td className="sticky right-0 z-10 bg-slate-950/80 px-3 py-2 text-right" style={{ width: 220 }}>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-200">{row.title}</p>
                        {row.ownerName ? (
                          <p className="truncate text-[10px] text-slate-500">{row.ownerName}</p>
                        ) : null}
                      </div>
                      {canEdit ? (
                        <button onClick={() => removeRow(row)} className="text-slate-600 hover:text-red-400">
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                  {Array.from({ length: TOTAL }, (_, i) => {
                    const st = row.weeks[String(i)] ?? "";
                    const bg =
                      st === "done" ? row.color : st === "planned" ? `${row.color}44` : "transparent";
                    return (
                      <td
                        key={i}
                        onClick={() => cycleCell(row, i)}
                        title={st === "done" ? "בוצע" : st === "planned" ? "מתוכנן" : ""}
                        className={`h-9 border-b border-slate-900 text-center ${
                          i % WEEKS_PER_MONTH === 0 ? "border-r border-slate-800" : "border-r border-slate-900/50"
                        } ${canEdit ? "cursor-pointer hover:bg-slate-800/40" : ""}`}
                        style={{ width: colW, background: bg }}
                      >
                        {st === "done" ? <span className="text-[10px] text-slate-950">✓</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {canEdit ? (
        <p className="text-[11px] text-slate-600">
          לחיצה על תא: ריק → מתוכנן → בוצע → ריק
        </p>
      ) : null}

      {showRow ? (
        <AddRowModal planId={plan.id} clientId={clientId} onClose={() => setShowRow(false)} onAdded={load} />
      ) : null}
    </div>
  );
}

function AddRowModal({
  planId,
  clientId,
  onClose,
  onAdded,
}: {
  planId: string;
  clientId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      // אם אין עדיין תוכנית (planId ריק) — נטען אותה קודם כדי לקבל id.
      let pid = planId;
      if (!pid) {
        const d = await api<{ plan: { id: string } | null }>(`/api/gantt?clientId=${clientId}`);
        pid = d.plan?.id ?? "";
      }
      await api("/api/gantt/tasks", {
        method: "POST",
        json: { planId: pid, title, ownerName: ownerName || null, color },
      });
      onAdded();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="שורת גאנט חדשה" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Field label="משימה / תוצר">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='למשל: "ניהול קמפיינים"' required />
        </Field>
        <Field label="מבצע (אופציונלי)">
          <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </Field>
        <Field label="צבע">
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full ${color === c ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "מוסיף…" : "הוספה"}</Button>
        </div>
      </form>
    </Modal>
  );
}
