"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { SYSTEM_KINDS } from "@/lib/defaults";
import { Button, Card, Chip, Field, Input, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { useCollapse, CollapseBtn } from "@/components/settings/Collapse";

interface Status {
  id: string;
  name: string;
  color: string;
  order: number;
  systemKind: string;
  isDefault: boolean;
  _count: { leads: number };
}

export default function StatusEditor({ clientId }: { clientId: string }) {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [collapsed, toggleCollapse] = useCollapse("client-statuses");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#38bdf8");
  const [systemKind, setSystemKind] = useState("in_progress");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ statuses: Status[] }>(`/api/statuses?clientId=${clientId}`);
      setStatuses(d.statuses);
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/statuses", {
        method: "POST",
        json: { clientId, name, color, systemKind },
      });
      setName("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, patch: Record<string, any>) {
    setError("");
    try {
      await api(`/api/statuses/${id}`, { method: "PATCH", json: patch });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(id: string) {
    if (!confirm("למחוק את הסטטוס?")) return;
    setError("");
    try {
      await api(`/api/statuses/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const a = statuses[idx];
    const b = statuses[idx + dir];
    if (!a || !b) return;
    await api(`/api/statuses/${a.id}`, { method: "PATCH", json: { order: b.order } });
    await api(`/api/statuses/${b.id}`, { method: "PATCH", json: { order: a.order } });
    await load();
  }

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-800">סטטוסים ללידים</h3>
        <CollapseBtn collapsed={collapsed} onClick={toggleCollapse} />
      </div>
      {collapsed ? null : (<>
      <p className="mb-4 text-xs text-slate-500">
        שם, צבע וסדר — בהגדרתכם. הסוג המערכתי קובע התנהגות: סטטוס מסוג
        &quot;עסקה&quot; מוריד דירה מהמלאי בפרויקטי נדל&quot;ן.
      </p>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-col gap-2">
        {statuses.map((s, i) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <input
              type="color"
              value={s.color}
              onChange={(e) => update(s.id, { color: e.target.value })}
              className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent"
              title="צבע"
            />
            <Chip color={s.color}>{s.name}</Chip>
            <span className="text-xs text-slate-500">
              {SYSTEM_KINDS.find((k) => k.value === s.systemKind)?.label}
              {" · "}
              {s._count.leads} לידים
              {s.isDefault ? " · ברירת מחדל ללידים חדשים" : ""}
            </span>
            <div className="mr-auto flex items-center gap-1">
              {!s.isDefault ? (
                <Button variant="ghost" size="sm" onClick={() => update(s.id, { isDefault: true })}>
                  קבע כברירת מחדל
                </Button>
              ) : null}
              <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-slate-500 hover:text-cyan-700 disabled:opacity-30" title="הזז למעלה">
                <Icon name="chevronDown" className="h-4 w-4 rotate-180" />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === statuses.length - 1} className="rounded p-1 text-slate-500 hover:text-cyan-700 disabled:opacity-30" title="הזז למטה">
                <Icon name="chevronDown" className="h-4 w-4" />
              </button>
              <button onClick={() => remove(s.id)} className="rounded p-1 text-slate-500 hover:text-red-600" title="מחיקה">
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-4">
        <div className="min-w-[140px] flex-1">
          <Field label="סטטוס חדש">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: ממתין לחוזה" required />
          </Field>
        </div>
        <Field label="צבע">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white" />
        </Field>
        <div className="w-44">
          <Field label="סוג מערכתי">
            <Select value={systemKind} onChange={(e) => setSystemKind(e.target.value)}>
              {SYSTEM_KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" disabled={busy}>
          <Icon name="plus" className="h-4 w-4" />
          הוספה
        </Button>
      </form>
      </>)}
    </Card>
  );
}
