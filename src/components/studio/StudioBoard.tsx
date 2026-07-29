"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Chip, Field, Input, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";
import StudioTaskDrawer from "@/components/studio/StudioTaskDrawer";
import {
  DESIGN_STATUSES,
  DESIGN_STATUS_LABELS,
  DESIGN_STATUS_COLORS,
  BRIEF_TYPES,
  briefTypeLabel,
  DESIGN_PRIORITIES,
} from "@/lib/studio";

interface Opt {
  id: string;
  name: string;
  color?: string | null;
}
interface DTask {
  id: string;
  title: string;
  briefType: string;
  priority: string;
  status: string;
  scheduledAt: string | null;
  dueAt: string | null;
  overdue: boolean;
  round: number;
  client: { id: string; name: string; color: string | null } | null;
  designer: { id: string; name: string } | null;
  _count?: { assets: number; feedback: number };
}

const PRIORITY_COLOR: Record<string, string> = { low: "#64748b", normal: "#38bdf8", high: "#f87171" };

export default function StudioBoard({
  clients,
  designers,
}: {
  clients: Opt[];
  designers: Opt[];
}) {
  const [tasks, setTasks] = useState<DTask[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [designerFilter, setDesignerFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = designerFilter ? `?designerId=${designerFilter}` : "";
    const d = await api<{ tasks: DTask[] }>(`/api/design-tasks${q}`);
    setTasks(d.tasks);
  }, [designerFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, data: Record<string, unknown>) {
    await api(`/api/design-tasks/${id}`, { method: "PATCH", json: data });
    load();
  }
  async function del(id: string) {
    if (!confirm("למחוק את משימת העיצוב?")) return;
    await api(`/api/design-tasks/${id}`, { method: "DELETE" });
    load();
  }
  function toLocalInput(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  }
  const selCls =
    "w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowCreate(true)}>
          <Icon name="plus" className="h-4 w-4" />
          בריף חדש
        </Button>
        <select
          value={designerFilter}
          onChange={(e) => setDesignerFilter(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">כל המעצבים</option>
          {designers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">{tasks.length} משימות</span>
      </div>

      <Card className="!p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-right text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500">
                <th className="px-3 py-2.5 font-medium">משימה</th>
                <th className="px-3 py-2.5 font-medium">לקוח</th>
                <th className="px-3 py-2.5 font-medium">סוג</th>
                <th className="px-3 py-2.5 font-medium">עדיפות</th>
                <th className="px-3 py-2.5 font-medium">מעצב/ת</th>
                <th className="px-3 py-2.5 font-medium">מתוזמן ללו״ז</th>
                <th className="px-3 py-2.5 font-medium">דדליין</th>
                <th className="px-3 py-2.5 font-medium">סטטוס</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-sm text-slate-600">
                    אין משימות עיצוב עדיין. לחצו על ״בריף חדש״.
                  </td>
                </tr>
              ) : null}
              {tasks.map((t) => (
                <tr key={t.id} className="border-b border-slate-800/60 align-middle hover:bg-slate-900/30">
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setOpenId(t.id)}
                      className="text-right font-medium text-slate-100 hover:text-cyan-300"
                    >
                      {t.title}
                    </button>
                    {t.overdue || t.round > 1 ? (
                      <div className="mt-1 flex gap-1">
                        {t.overdue ? <Chip color="#f87171">באיחור</Chip> : null}
                        {t.round > 1 ? <Chip color="#f97316">סבב {t.round}</Chip> : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {t.client ? <Chip color={t.client.color ?? "#64748b"}>{t.client.name}</Chip> : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-300">{briefTypeLabel(t.briefType)}</td>
                  <td className="px-3 py-2">
                    <Chip color={PRIORITY_COLOR[t.priority]}>
                      {DESIGN_PRIORITIES.find((p) => p.value === t.priority)?.label}
                    </Chip>
                  </td>
                  <td className="px-3 py-2 w-40">
                    <select
                      value={t.designer?.id ?? ""}
                      onChange={(e) => patch(t.id, { designerId: e.target.value || null })}
                      className={selCls}
                    >
                      <option value="">— לא משויך —</option>
                      {designers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 w-48">
                    <input
                      type="datetime-local"
                      dir="ltr"
                      value={toLocalInput(t.scheduledAt)}
                      onChange={(e) =>
                        patch(t.id, {
                          scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                        })
                      }
                      className={selCls}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {t.dueAt ? formatDateTime(t.dueAt) : "—"}
                  </td>
                  <td className="px-3 py-2 w-44">
                    <select
                      value={t.status}
                      onChange={(e) => patch(t.id, { status: e.target.value })}
                      className={selCls}
                      style={{ borderColor: DESIGN_STATUS_COLORS[t.status] }}
                    >
                      {DESIGN_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {DESIGN_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-left">
                    <button
                      onClick={() => del(t.id)}
                      title="מחיקה"
                      className="text-slate-600 transition hover:text-rose-400"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate ? (
        <CreateBriefModal
          clients={clients}
          designers={designers}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      ) : null}

      {openId ? (
        <StudioTaskDrawer taskId={openId} onClose={() => setOpenId(null)} onChanged={load} />
      ) : null}
    </div>
  );
}

function CreateBriefModal({
  clients,
  designers,
  onClose,
  onCreated,
}: {
  clients: Opt[];
  designers: Opt[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    clientId: "",
    title: "",
    briefType: "post",
    brief: "",
    specs: "",
    priority: "normal",
    designerId: "",
    scheduledAt: "",
    dueAt: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/design-tasks", {
        method: "POST",
        json: {
          clientId: form.clientId,
          title: form.title,
          briefType: form.briefType,
          brief: form.brief || null,
          specs: form.specs || null,
          priority: form.priority,
          designerId: form.designerId || null,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        },
      });
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="בריף עיצוב חדש" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="לקוח">
            <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required>
              <option value="">— בחר לקוח —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="סוג עבודה">
            <Select value={form.briefType} onChange={(e) => setForm({ ...form, briefType: e.target.value })}>
              {BRIEF_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="כותרת המשימה">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </Field>
        <Field label="בריף מפורט למעצב/ת">
          <textarea
            value={form.brief}
            onChange={(e) => setForm({ ...form, brief: e.target.value })}
            rows={4}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
            placeholder="מטרה, מסר, סגנון, טקסטים, צבעים, מה חובה לכלול…"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="מפרט טכני (מידות/פורמט)">
            <Input value={form.specs} onChange={(e) => setForm({ ...form, specs: e.target.value })} placeholder="1080×1080, PDF להדפסה…" />
          </Field>
          <Field label="עדיפות">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {DESIGN_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="מעצב/ת">
            <Select value={form.designerId} onChange={(e) => setForm({ ...form, designerId: e.target.value })}>
              <option value="">— לא משויך —</option>
              {designers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="תזמון בלו״ז">
            <Input type="datetime-local" dir="ltr" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
          </Field>
          <Field label="דדליין ללקוח">
            <Input type="datetime-local" dir="ltr" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" disabled={busy || !form.clientId || !form.title}>
            {busy ? "יוצר…" : "יצירת בריף"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
