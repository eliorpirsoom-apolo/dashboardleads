"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { Button, Card } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { TaskFormModal, type TaskRow } from "@/components/tasks/TasksView";

// ---------------------------------------------------------------------------
// לוח צוות (כמו מאנדיי): בלוק לכל עובד/ת משרד עם המשימות שלו/ה.
// גרירה בין בלוקים = העברת אחריות; בתוך בלוק = סידור ידני; חדש = למעלה.
// ---------------------------------------------------------------------------

const PRIORITIES: { key: string; label: string; color: string }[] = [
  { key: "low", label: "קל", color: "#64748b" },
  { key: "normal", label: "בינוני", color: "#3a5bd9" },
  { key: "urgent", label: "דחוף", color: "#e11d48" },
];
const prOf = (p: string) => PRIORITIES.find((x) => x.key === p) ?? PRIORITIES[1];

const STATUSES: { key: string; label: string; color: string }[] = [
  { key: "open", label: "פתוחה", color: "#0891b2" },
  { key: "in_progress", label: "בביצוע", color: "#f59e0b" },
  { key: "done", label: "הושלמה ✓", color: "#10b981" },
];
const stOf = (s: string) => STATUSES.find((x) => x.key === s) ?? STATUSES[0];

interface BoardTask extends TaskRow {
  priority: string;
  orderIndex: number;
  createdAt?: string;
}

export default function TasksBoards({
  users,
  clients,
  meId,
  onChanged,
}: {
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  meId?: string | null;
  onChanged?: () => void;
}) {
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null); // `${boardKey}:${taskId|"end"}`
  const [editTask, setEditTask] = useState<BoardTask | null>(null);
  const [createFor, setCreateFor] = useState<string | null | false>(false); // false=סגור; string|null=בורד יעד

  const load = useCallback(async () => {
    try {
      const d = await api<{ tasks: BoardTask[] }>("/api/tasks?ownerSide=agency");
      setTasks(d.tasks);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const byOrder = (a: BoardTask, b: BoardTask) =>
    a.orderIndex - b.orderIndex || (b.createdAt || "").localeCompare(a.createdAt || "");

  async function patch(id: string, data: Record<string, unknown>) {
    try {
      await api(`/api/tasks/${id}`, { method: "PATCH", json: data });
    } catch (e: any) {
      setError(e.message);
    }
    load();
    onChanged?.();
  }
  async function del(id: string) {
    if (!confirm("למחוק את המשימה?")) return;
    await api(`/api/tasks/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  const keyOf = (assigneeId: string | null) => assigneeId ?? "none";
  const idOf = (key: string): string | null => (key === "none" ? null : key);

  async function handleDrop(boardKey: string, beforeTaskId: string | null) {
    const id = dragId;
    setDragId(null);
    setDragOver(null);
    if (!id) return;
    const assigneeId = idOf(boardKey);
    const board = tasks
      .filter((t) => keyOf(t.assignee?.id ?? null) === boardKey && (showDone || t.status !== "done") && t.status !== "canceled")
      .sort(byOrder)
      .filter((t) => t.id !== id);
    const at = beforeTaskId ? board.findIndex((t) => t.id === beforeTaskId) : -1;
    const idx = beforeTaskId && at >= 0 ? at : board.length;
    const order = [...board.slice(0, idx).map((t) => t.id), id, ...board.slice(idx).map((t) => t.id)];
    try {
      await api("/api/tasks/reorder", { method: "POST", json: { assigneeId, taskIds: order } });
    } finally {
      load();
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-[#3a5bd9] focus:outline-none";
  const toLocal = (iso: string) => {
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const now = Date.now();

  // הבורד של המשתמש הנוכחי ראשון, אחריו שאר העובדים, ולבסוף "ללא אחראי".
  const orderedUsers = [...users].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name, "he")));
  const boards = [
    ...orderedUsers.map((u) => ({ key: u.id, name: u.id === meId ? `${u.name} (אני)` : u.name })),
    { key: "none", name: "ללא אחראי" },
  ];

  const COLS = 8;

  const renderRow = (t: BoardTask, boardKey: string) => {
    const st = stOf(t.status);
    const pr = prOf(t.priority);
    const overdue = t.status !== "done" && new Date(t.dueAt).getTime() < now;
    return (
      <tr
        key={t.id}
        draggable
        onDragStart={() => setDragId(t.id)}
        onDragEnd={() => { setDragId(null); setDragOver(null); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(`${boardKey}:${t.id}`); }}
        onDrop={(e) => { e.preventDefault(); handleDrop(boardKey, t.id); }}
        className={`border-b border-slate-100 align-middle hover:bg-slate-50 ${t.status === "done" ? "opacity-55" : ""} ${dragId === t.id ? "opacity-40" : ""} ${dragOver === `${boardKey}:${t.id}` ? "border-t-2 border-t-cyan-400" : ""}`}
      >
        <td className="px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 cursor-grab select-none text-slate-400" title="גרירה">⠿</span>
            <span className="shrink-0" title={t.type === "meeting" ? "פגישה" : "משימה"}>
              {t.type === "meeting" ? "📅" : "✔️"}
            </span>
            <button
              onClick={() => setEditTask(t)}
              title={t.title}
              className={`block max-w-full truncate text-right font-medium text-slate-800 hover:text-[#3a5bd9] ${t.status === "done" ? "line-through" : ""}`}
            >
              {t.title}
            </button>
            {t.reminders?.some((r) => r.status === "pending") ? (
              <Icon name="clock" className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            ) : null}
          </div>
        </td>
        <td className="px-2 py-1.5">
          {t.client ? (
            <span
              className="block max-w-full truncate rounded-full px-2 py-0.5 text-center text-[11px] font-medium"
              title={t.client.name}
              style={{ color: t.client.color ?? "#64748b", backgroundColor: `${t.client.color ?? "#64748b"}1a` }}
            >
              {t.client.name}
            </span>
          ) : (
            <span className="block text-center text-slate-300">—</span>
          )}
        </td>
        <td className="truncate px-2 py-1.5 text-xs text-slate-500" title={t.lead ? `ליד #${t.lead.number}` : undefined}>
          {t.lead ? `#${t.lead.number} ${t.lead.fullName ?? ""}` : "—"}
        </td>
        <td className="px-2 py-1.5">
          <input
            type="datetime-local"
            dir="ltr"
            defaultValue={toLocal(t.dueAt)}
            onBlur={(e) => e.target.value && new Date(e.target.value).toISOString() !== t.dueAt && patch(t.id, { dueAt: new Date(e.target.value).toISOString() })}
            className={`${inputCls} ${overdue ? "!border-rose-300 !text-rose-600" : ""}`}
            title={overdue ? "באיחור" : undefined}
          />
        </td>
        <td className="px-2 py-1.5">
          <select
            value={t.priority}
            onChange={(e) => patch(t.id, { priority: e.target.value })}
            className={`${inputCls} font-medium`}
            style={{ borderColor: pr.color, color: pr.color, backgroundColor: `${pr.color}12` }}
          >
            {PRIORITIES.map((x) => (<option key={x.key} value={x.key} style={{ color: "#0f172a" }}>{x.label}</option>))}
          </select>
        </td>
        <td className="px-2 py-1.5">
          <select
            value={t.status}
            onChange={(e) => patch(t.id, { status: e.target.value })}
            className={`${inputCls} font-medium`}
            style={{ borderColor: st.color, color: st.color, backgroundColor: `${st.color}14` }}
          >
            {STATUSES.map((x) => (<option key={x.key} value={x.key} style={{ color: "#0f172a" }}>{x.label}</option>))}
          </select>
        </td>
        <td className="px-1 py-1.5 text-center">
          <button onClick={() => del(t.id)} title="מחיקה" className="text-slate-400 transition hover:text-rose-500">
            <Icon name="trash" className="h-3.5 w-3.5" />
          </button>
        </td>
        <td className="px-0 py-1.5"></td>
      </tr>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">גררו משימה ⠿ בין הבורדים כדי להעביר אחריות · חדש תמיד למעלה</p>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="h-3.5 w-3.5 accent-[#3a5bd9]" />
          הצגת משימות שהושלמו
        </label>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-[1000px] flex-col gap-3">
          {boards.map((board) => {
            const items = tasks
              .filter((t) => keyOf(t.assignee?.id ?? null) === board.key && t.status !== "canceled" && (showDone || t.status !== "done"))
              .sort(byOrder);
            if (board.key === "none" && items.length === 0) return null;
            const openCount = items.filter((t) => t.status !== "done").length;
            const isCollapsed = !!collapsed[board.key];
            return (
              <Fragment key={board.key}>
                <Card className="!p-0 overflow-hidden">
                  <div
                    className="flex items-center gap-2 px-3 py-2.5"
                    style={{ boxShadow: `inset 4px 0 0 ${board.key === "none" ? "#94a3b8" : "#3a5bd9"}` }}
                    onDragOver={(e) => { if (!dragId) return; e.preventDefault(); setDragOver(`${board.key}:end`); }}
                    onDrop={(e) => { if (!dragId) return; e.preventDefault(); handleDrop(board.key, null); }}
                  >
                    <button onClick={() => setCollapsed((p) => ({ ...p, [board.key]: !p[board.key] }))} className="text-slate-400 hover:text-slate-900">
                      {isCollapsed ? "▸" : "▾"}
                    </button>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3a5bd9]/10 text-[11px] font-bold text-[#3a5bd9]">
                      {board.name.slice(0, 1)}
                    </span>
                    <span className="font-bold text-slate-800">{board.name}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{openCount} פתוחות</span>
                    <span className="mr-auto">
                      <button onClick={() => setCreateFor(idOf(board.key))} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-[#3a5bd9]">
                        <Icon name="plus" className="h-3.5 w-3.5" /> משימה
                      </button>
                    </span>
                  </div>
                  {!isCollapsed ? (
                    <div className="border-t border-slate-200">
                      <table className="w-full table-fixed text-right text-sm">
                        <colgroup>
                          <col style={{ width: 250 }} />
                          <col style={{ width: 120 }} />
                          <col style={{ width: 130 }} />
                          <col style={{ width: 150 }} />
                          <col style={{ width: 96 }} />
                          <col style={{ width: 104 }} />
                          <col style={{ width: 36 }} />
                          <col />
                        </colgroup>
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                            <th className="px-2 py-2 text-right font-medium">משימה</th>
                            <th className="px-2 py-2 text-right font-medium">לקוח</th>
                            <th className="px-2 py-2 text-right font-medium">ליד</th>
                            <th className="px-2 py-2 text-right font-medium">דדליין</th>
                            <th className="px-2 py-2 text-right font-medium">עדיפות</th>
                            <th className="px-2 py-2 text-right font-medium">סטטוס</th>
                            <th className="px-1 py-2"></th>
                            <th className="px-0 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((t) => renderRow(t, board.key))}
                          {dragId ? (
                            <tr
                              onDragOver={(e) => { e.preventDefault(); setDragOver(`${board.key}:end`); }}
                              onDrop={(e) => { e.preventDefault(); handleDrop(board.key, null); }}
                            >
                              <td colSpan={COLS} className={`px-3 py-2 text-center text-[11px] ${dragOver === `${board.key}:end` ? "bg-cyan-500/10 text-cyan-700" : "text-slate-500"}`}>
                                גררו לכאן להעברה ל{board.name}
                              </td>
                            </tr>
                          ) : items.length === 0 ? (
                            <tr><td colSpan={COLS} className="px-3 py-3 text-center text-[11px] text-slate-500">אין משימות פתוחות 🎉</td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </Card>
              </Fragment>
            );
          })}
        </div>
      </div>

      {editTask || createFor !== false ? (
        <TaskFormModal
          isAdmin
          clients={clients}
          users={users}
          task={editTask}
          defaultAssigneeId={createFor === false ? undefined : createFor ?? ""}
          onClose={() => { setEditTask(null); setCreateFor(false); }}
          onSaved={() => { setEditTask(null); setCreateFor(false); load(); onChanged?.(); }}
        />
      ) : null}
    </div>
  );
}
