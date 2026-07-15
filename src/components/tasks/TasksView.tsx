"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime, formatDayHeader } from "@/lib/format";
import { Button, Chip, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  ownerSide: string;
  status: string;
  dueAt: string;
  durationMin: number | null;
  location: string | null;
  assignee: { id: string; name: string } | null;
  client: { id: string; name: string; color: string | null } | null;
  lead: { id: string; fullName: string | null; number: number } | null;
  reminders: { id: string; channel: string; remindAt: string; status: string }[];
}

const REMINDER_OPTIONS = [
  { value: "", label: "ללא תזכורת" },
  { value: "0", label: "בזמן המשימה" },
  { value: "15", label: "15 דקות לפני" },
  { value: "60", label: "שעה לפני" },
  { value: "180", label: "3 שעות לפני" },
  { value: "1440", label: "יום לפני" },
];

export default function TasksView({
  isAdmin,
  clientId,
  clients = [],
  users = [],
}: {
  isAdmin: boolean;
  clientId?: string; // fixed scope (client side / admin client workspace)
  clients?: { id: string; name: string }[];
  users?: { id: string; name: string }[];
}) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("open");
  const [typeFilter, setTypeFilter] = useState("");
  const [sideFilter, setSideFilter] = useState("");
  const [error, setError] = useState("");
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (statusFilter) p.set("status", statusFilter);
      if (typeFilter) p.set("type", typeFilter);
      if (sideFilter) p.set("ownerSide", sideFilter);
      if (clientId) p.set("clientId", clientId);
      const d = await api<{ tasks: TaskRow[] }>(`/api/tasks?${p}`);
      setTasks(d.tasks);
    } catch (e: any) {
      setError(e.message);
    }
  }, [statusFilter, typeFilter, sideFilter, clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleDone(t: TaskRow) {
    await api(`/api/tasks/${t.id}`, {
      method: "PATCH",
      json: { status: t.status === "done" ? "open" : "done" },
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("למחוק את המשימה?")) return;
    await api(`/api/tasks/${id}`, { method: "DELETE" });
    load();
  }

  // Group by day for a "daily tasks" feel.
  const groups = tasks.reduce<Record<string, TaskRow[]>>((acc, t) => {
    const day = formatDayHeader(t.dueAt);
    (acc[day] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      <div className="glass flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div className="w-32">
          <Field label="מצב">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="open">פתוחות</option>
              <option value="done">הושלמו</option>
              <option value="">הכול</option>
            </Select>
          </Field>
        </div>
        <div className="w-32">
          <Field label="סוג">
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">הכול</option>
              <option value="task">משימות</option>
              <option value="meeting">פגישות</option>
            </Select>
          </Field>
        </div>
        {isAdmin ? (
          <div className="w-36">
            <Field label="צד">
              <Select value={sideFilter} onChange={(e) => setSideFilter(e.target.value)}>
                <option value="">הכול</option>
                <option value="agency">המשרד</option>
                <option value="client">לקוחות</option>
              </Select>
            </Field>
          </div>
        ) : null}
        <div className="mr-auto">
          <Button onClick={() => setShowCreate(true)}>
            <Icon name="plus" className="h-4 w-4" />
            משימה / פגישה
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {tasks.length === 0 ? (
        <div className="glass rounded-2xl p-2">
          <EmptyState icon="tasks" title="אין משימות" hint="צרו משימה או פגישה חדשה." />
        </div>
      ) : (
        Object.entries(groups).map(([day, dayTasks]) => (
          <div key={day}>
            <h3 className="mb-2 text-sm font-bold text-slate-400">{day}</h3>
            <div className="flex flex-col gap-2">
              {dayTasks.map((t) => (
                <div
                  key={t.id}
                  className={`glass glass-hover flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 ${
                    t.status === "done" ? "opacity-50" : ""
                  }`}
                >
                  <button
                    onClick={() => toggleDone(t)}
                    className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${
                      t.status === "done"
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                        : "border-slate-600 text-transparent hover:border-cyan-400"
                    }`}
                    title={t.status === "done" ? "החזרה לפתוחה" : "סימון כהושלמה"}
                  >
                    <Icon name="check" className="h-3.5 w-3.5" />
                  </button>

                  <Icon
                    name={t.type === "meeting" ? "calendar" : "tasks"}
                    className={`h-4 w-4 ${t.type === "meeting" ? "text-violet-400" : "text-cyan-400"}`}
                  />

                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium text-slate-200 ${t.status === "done" ? "line-through" : ""}`}>
                      {t.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDateTime(t.dueAt)}
                      {t.durationMin ? ` · ${t.durationMin} דק׳` : ""}
                      {t.location ? ` · ${t.location}` : ""}
                      {t.assignee ? ` · ${t.assignee.name}` : ""}
                      {t.lead ? ` · ליד #${t.lead.number} ${t.lead.fullName ?? ""}` : ""}
                    </p>
                  </div>

                  {isAdmin && t.client ? (
                    <Chip color={t.client.color ?? "#64748b"}>{t.client.name}</Chip>
                  ) : null}
                  <Chip color={t.ownerSide === "agency" ? "#818cf8" : "#22d3ee"}>
                    {t.ownerSide === "agency" ? "המשרד" : "הלקוח"}
                  </Chip>
                  {t.reminders.some((r) => r.status === "pending") ? (
                    <Icon name="clock" className="h-4 w-4 text-amber-400" />
                  ) : null}

                  <div className="flex gap-1">
                    <button onClick={() => setEditTask(t)} className="rounded p-1.5 text-slate-500 hover:text-cyan-300" title="עריכה">
                      <Icon name="edit" className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(t.id)} className="rounded p-1.5 text-slate-500 hover:text-red-400" title="מחיקה">
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {showCreate || editTask ? (
        <TaskFormModal
          isAdmin={isAdmin}
          clientId={clientId}
          clients={clients}
          users={users}
          task={editTask}
          onClose={() => {
            setShowCreate(false);
            setEditTask(null);
          }}
          onSaved={() => {
            setShowCreate(false);
            setEditTask(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

export function TaskFormModal({
  isAdmin,
  clientId,
  clients,
  users,
  task,
  defaultDate,
  onClose,
  onSaved,
}: {
  isAdmin: boolean;
  clientId?: string;
  clients: { id: string; name: string }[];
  users: { id: string; name: string }[];
  task: TaskRow | null;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toLocal = (iso: string) => {
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const [form, setForm] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    type: task?.type ?? "task",
    ownerSide: task?.ownerSide ?? (isAdmin ? "agency" : "client"),
    clientId: task?.client?.id ?? clientId ?? "",
    assigneeId: task?.assignee?.id ?? "",
    dueAt: task ? toLocal(task.dueAt) : defaultDate ? `${defaultDate}T10:00` : "",
    durationMin: task?.durationMin ?? 60,
    location: task?.location ?? "",
    reminderChannel: "email",
    reminderMinutes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload: any = {
        title: form.title,
        description: form.description || null,
        type: form.type,
        ownerSide: form.ownerSide,
        clientId: form.clientId || null,
        assigneeId: form.assigneeId || null,
        dueAt: new Date(form.dueAt).toISOString(),
        durationMin: form.type === "meeting" ? Number(form.durationMin) || 60 : null,
        location: form.location || null,
        reminder:
          form.reminderMinutes !== ""
            ? {
                channel: form.reminderChannel,
                minutesBefore: Number(form.reminderMinutes),
              }
            : null,
      };
      if (task) {
        await api(`/api/tasks/${task.id}`, { method: "PATCH", json: payload });
      } else {
        await api("/api/tasks", { method: "POST", json: payload });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={task ? "עריכת משימה" : "משימה / פגישה חדשה"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <div className="flex gap-2">
          {(["task", "meeting"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm({ ...form, type: t })}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                form.type === t
                  ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-300"
                  : "border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
            >
              {t === "task" ? "משימה" : "פגישה"}
            </button>
          ))}
        </div>

        <Field label="כותרת">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </Field>

        <Field label="פירוט">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="מועד">
            <Input
              type="datetime-local"
              value={form.dueAt}
              onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
              required
            />
          </Field>
          {form.type === "meeting" ? (
            <Field label="משך (דקות)">
              <Input
                type="number"
                value={form.durationMin}
                onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })}
              />
            </Field>
          ) : (
            <div />
          )}
        </div>

        {form.type === "meeting" ? (
          <Field label="מיקום / קישור">
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="משרד, Zoom…" />
          </Field>
        ) : null}

        {isAdmin && !clientId ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="שיוך ללקוח">
              <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                <option value="">פנימי — המשרד</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="צד אחראי">
              <Select value={form.ownerSide} onChange={(e) => setForm({ ...form, ownerSide: e.target.value })}>
                <option value="agency">המשרד</option>
                <option value="client">הלקוח</option>
              </Select>
            </Field>
          </div>
        ) : null}

        {users.length > 0 ? (
          <Field label="משויך ל…">
            <Select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="תזכורת">
            <Select value={form.reminderMinutes} onChange={(e) => setForm({ ...form, reminderMinutes: e.target.value })}>
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          {form.reminderMinutes !== "" ? (
            <Field label="ערוץ תזכורת" hint="SMS ווואטסאפ יופעלו כשיחובר ספק">
              <Select value={form.reminderChannel} onChange={(e) => setForm({ ...form, reminderChannel: e.target.value })}>
                <option value="email">אימייל</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">וואטסאפ</option>
              </Select>
            </Field>
          ) : (
            <div />
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "שומר…" : "שמירה"}</Button>
        </div>
      </form>
    </Modal>
  );
}
