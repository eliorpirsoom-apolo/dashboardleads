"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatTime } from "@/lib/format";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { TaskFormModal, type TaskRow } from "./TasksView";

const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarView({
  isAdmin,
  clientId,
  clients = [],
  users = [],
}: {
  isAdmin: boolean;
  clientId?: string;
  clients?: { id: string; name: string }[];
  users?: { id: string; name: string }[];
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>(ymd(new Date()));

  const monthLabel = cursor.toLocaleDateString("he-IL", {
    month: "long",
    year: "numeric",
  });

  const load = useCallback(async () => {
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), -7);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 7);
    const p = new URLSearchParams({ from: ymd(from), to: ymd(to) });
    if (clientId) p.set("clientId", clientId);
    const d = await api<{ tasks: TaskRow[] }>(`/api/tasks?${p}`);
    setTasks(d.tasks);
  }, [cursor, clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map: Record<string, TaskRow[]> = {};
    for (const t of tasks) {
      (map[ymd(new Date(t.dueAt))] ??= []).push(t);
    }
    return map;
  }, [tasks]);

  // Build the month grid (weeks start Sunday).
  const cells = useMemo(() => {
    const first = new Date(cursor);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(d);
    }
    return out;
  }, [cursor]);

  const today = ymd(new Date());
  const dayTasks = byDay[selectedDay] ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="glass rounded-2xl p-4">
        {/* Month header */}
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            ‹ הקודם
          </Button>
          <h3 className="text-base font-bold text-slate-100">{monthLabel}</h3>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            הבא ›
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1 font-medium">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d) => {
            const key = ymd(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const list = byDay[key] ?? [];
            return (
              <button
                key={key}
                onClick={() => setSelectedDay(key)}
                onDoubleClick={() => setCreateDate(key)}
                className={`flex min-h-[72px] flex-col rounded-lg border p-1.5 text-right transition ${
                  selectedDay === key
                    ? "border-cyan-500/60 bg-cyan-500/10"
                    : key === today
                      ? "border-indigo-500/50 bg-indigo-500/5"
                      : "border-slate-800/70 hover:border-slate-600"
                } ${inMonth ? "" : "opacity-35"}`}
              >
                <span className={`text-xs ${key === today ? "font-bold text-indigo-300" : "text-slate-400"}`}>
                  {d.getDate()}
                </span>
                <div className="mt-1 flex flex-col gap-0.5">
                  {list.slice(0, 3).map((t) => (
                    <span
                      key={t.id}
                      className={`truncate rounded px-1 text-[10px] leading-4 ${
                        t.type === "meeting"
                          ? "bg-violet-500/20 text-violet-300"
                          : "bg-cyan-500/15 text-cyan-300"
                      } ${t.status === "done" ? "line-through opacity-50" : ""}`}
                    >
                      {t.title}
                    </span>
                  ))}
                  {list.length > 3 ? (
                    <span className="text-[10px] text-slate-500">+{list.length - 3}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-600">
          לחיצה — צפייה ביום · לחיצה כפולה — הוספת משימה ליום
        </p>
      </div>

      {/* Selected day panel */}
      <div className="glass flex flex-col gap-2 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200">
            {new Date(selectedDay).toLocaleDateString("he-IL", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </h3>
          <Button size="sm" onClick={() => setCreateDate(selectedDay)}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            הוספה
          </Button>
        </div>
        {dayTasks.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-600">אין משימות ביום זה</p>
        ) : (
          dayTasks
            .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
            .map((t) => (
              <button
                key={t.id}
                onClick={() => setEditTask(t)}
                className="flex items-center gap-2 rounded-xl border border-slate-800 px-3 py-2 text-right transition hover:border-cyan-500/40"
              >
                <span className="font-mono text-xs text-slate-500">{formatTime(t.dueAt)}</span>
                <Icon
                  name={t.type === "meeting" ? "calendar" : "tasks"}
                  className={`h-3.5 w-3.5 ${t.type === "meeting" ? "text-violet-400" : "text-cyan-400"}`}
                />
                <span className={`flex-1 truncate text-sm text-slate-200 ${t.status === "done" ? "line-through opacity-60" : ""}`}>
                  {t.title}
                </span>
                {isAdmin && t.client ? (
                  <span className="text-[10px] text-slate-500">{t.client.name}</span>
                ) : null}
              </button>
            ))
        )}
      </div>

      {createDate || editTask ? (
        <TaskFormModal
          isAdmin={isAdmin}
          clientId={clientId}
          clients={clients}
          users={users}
          task={editTask}
          defaultDate={createDate ?? undefined}
          onClose={() => {
            setCreateDate(null);
            setEditTask(null);
          }}
          onSaved={() => {
            setCreateDate(null);
            setEditTask(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
