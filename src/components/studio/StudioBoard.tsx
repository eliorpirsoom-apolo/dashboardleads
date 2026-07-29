"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Chip, Field, Input, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";
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

      <div className="flex gap-3 overflow-x-auto pb-3">
        {DESIGN_STATUSES.map((st) => {
          const col = tasks.filter((t) => t.status === st);
          return (
            <div key={st} className="w-72 shrink-0">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: DESIGN_STATUS_COLORS[st] }}
                />
                <h3 className="text-sm font-bold text-slate-200">{DESIGN_STATUS_LABELS[st]}</h3>
                <span className="text-xs text-slate-600">{col.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {col.map((t) => (
                  <Card key={t.id} className="!p-3">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <span className="text-sm font-bold text-slate-100">{t.title}</span>
                      {t.overdue ? <Chip color="#f87171">באיחור</Chip> : null}
                    </div>
                    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      {t.client ? (
                        <Chip color={t.client.color ?? "#64748b"}>{t.client.name}</Chip>
                      ) : null}
                      <Chip color="#818cf8">{briefTypeLabel(t.briefType)}</Chip>
                      <Chip color={PRIORITY_COLOR[t.priority]}>
                        {DESIGN_PRIORITIES.find((p) => p.value === t.priority)?.label}
                      </Chip>
                      {t.round > 1 ? <Chip color="#f97316">סבב {t.round}</Chip> : null}
                    </div>
                    {t.scheduledAt ? (
                      <p className="mb-2 text-[11px] text-slate-500">
                        🗓️ {formatDateTime(t.scheduledAt)}
                      </p>
                    ) : null}
                    <div className="flex flex-col gap-1.5">
                      <select
                        value={t.designer?.id ?? ""}
                        onChange={(e) => patch(t.id, { designerId: e.target.value || null })}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300"
                      >
                        <option value="">— מעצב/ת —</option>
                        {designers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={t.status}
                        onChange={(e) => patch(t.id, { status: e.target.value })}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300"
                      >
                        {DESIGN_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {DESIGN_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </Card>
                ))}
                {col.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-800 py-4 text-center text-[11px] text-slate-700">
                    —
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

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
