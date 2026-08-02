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

interface GoogleEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  ownerId: string;
  ownerName: string;
  color: string;
  calendarName: string;
  link: string | null;
}

interface GcalConnection {
  userId: string;
  name: string;
  email: string;
  color: string;
  error: string | null;
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
  const [gEvents, setGEvents] = useState<GoogleEvent[]>([]);
  const [gConnections, setGConnections] = useState<GcalConnection[]>([]);
  const [gMe, setGMe] = useState<{ email: string } | null>(null);
  const [hiddenOwners, setHiddenOwners] = useState<Set<string>>(new Set());
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

    // יומני Google של הצוות — צד משרד בלבד; כשל שקט לא מפיל את הלוח.
    if (isAdmin) {
      try {
        const g = await api<{
          events: GoogleEvent[];
          connections: GcalConnection[];
          me: { email: string } | null;
        }>(`/api/gcal/events?from=${ymd(from)}&to=${ymd(to)}`);
        setGEvents(g.events);
        setGConnections(g.connections);
        setGMe(g.me);
      } catch {
        setGEvents([]);
      }
    }
  }, [cursor, clientId, isAdmin]);

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

  // אירועי Google לפי יום — בלי אירועים שכבר מסונכרנים מהמערכת (מניעת כפל),
  // ובלי עובדים שהוסתרו בסינון.
  const googleByDay = useMemo(() => {
    const syncedTitles = new Set(
      tasks.map((t) => `${ymd(new Date(t.dueAt))}|${t.title}`)
    );
    const map: Record<string, GoogleEvent[]> = {};
    for (const e of gEvents) {
      if (hiddenOwners.has(e.ownerId)) continue;
      const day = ymd(new Date(e.start));
      if (syncedTitles.has(`${day}|${e.title}`) || syncedTitles.has(`${day}|✓ ${e.title}`)) continue;
      (map[day] ??= []).push(e);
    }
    return map;
  }, [gEvents, tasks, hiddenOwners]);

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
  const dayGoogle = googleByDay[selectedDay] ?? [];

  async function disconnectGcal() {
    if (!confirm("לנתק את יומן ה-Google שלך מהלוח?")) return;
    await api("/api/gcal", { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-3">
      {isAdmin ? (
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5">
          <span className="text-xs font-medium text-slate-400">יומני Google של הצוות:</span>
          {gConnections.length === 0 ? (
            <span className="text-xs text-slate-600">אף אחד לא חיבר עדיין</span>
          ) : (
            gConnections.map((c) => (
              <button
                key={c.userId}
                onClick={() => {
                  const next = new Set(hiddenOwners);
                  next.has(c.userId) ? next.delete(c.userId) : next.add(c.userId);
                  setHiddenOwners(next);
                }}
                title={c.error ? `שגיאה: ${c.error}` : `${c.email} — לחיצה מסתירה/מציגה`}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                  hiddenOwners.has(c.userId)
                    ? "border-slate-200 text-slate-600 line-through"
                    : "border-slate-300 text-slate-700"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                {c.name}
                {c.error ? " ⚠️" : ""}
              </button>
            ))
          )}
          <span className="flex-1" />
          {gMe ? (
            <button
              onClick={disconnectGcal}
              className="text-xs text-slate-500 hover:text-red-600"
              title={gMe.email}
            >
              ניתוק היומן שלי
            </button>
          ) : (
            <a
              href="/api/integrations/google/connect?kind=calendar"
              className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-500/25"
            >
              + חיבור היומן שלי
            </a>
          )}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="glass rounded-2xl p-4">
        {/* Month header */}
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            ‹ הקודם
          </Button>
          <h3 className="text-base font-bold text-slate-800">{monthLabel}</h3>
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
            const gList = googleByDay[key] ?? [];
            const shown = list.slice(0, 3);
            const gShown = gList.slice(0, Math.max(0, 3 - shown.length));
            const extra = list.length + gList.length - shown.length - gShown.length;
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
                      : "border-slate-200/70 hover:border-slate-600"
                } ${inMonth ? "" : "opacity-35"}`}
              >
                <span className={`text-xs ${key === today ? "font-bold text-indigo-700" : "text-slate-400"}`}>
                  {d.getDate()}
                </span>
                <div className="mt-1 flex flex-col gap-0.5">
                  {shown.map((t) => (
                    <span
                      key={t.id}
                      className={`truncate rounded px-1 text-[10px] leading-4 ${
                        t.type === "meeting"
                          ? "bg-violet-500/20 text-violet-700"
                          : "bg-cyan-500/15 text-cyan-700"
                      } ${t.status === "done" ? "line-through opacity-50" : ""}`}
                    >
                      {t.title}
                    </span>
                  ))}
                  {gShown.map((e) => (
                    <span
                      key={e.id}
                      className="truncate rounded px-1 text-[10px] leading-4 text-slate-700"
                      style={{ backgroundColor: `${e.color}2e` }}
                    >
                      {e.title}
                    </span>
                  ))}
                  {extra > 0 ? (
                    <span className="text-[10px] text-slate-500">+{extra}</span>
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
          <h3 className="text-sm font-bold text-slate-700">
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
        {dayTasks.length === 0 && dayGoogle.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-600">אין משימות ביום זה</p>
        ) : (
          <>
            {dayTasks
              .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => setEditTask(t)}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-right transition hover:border-cyan-500/40"
                >
                  <span className="font-mono text-xs text-slate-500">{formatTime(t.dueAt)}</span>
                  <Icon
                    name={t.type === "meeting" ? "calendar" : "tasks"}
                    className={`h-3.5 w-3.5 ${t.type === "meeting" ? "text-violet-400" : "text-cyan-400"}`}
                  />
                  <span className={`flex-1 truncate text-sm text-slate-700 ${t.status === "done" ? "line-through opacity-60" : ""}`}>
                    {t.title}
                  </span>
                  {isAdmin && t.client ? (
                    <span className="text-[10px] text-slate-500">{t.client.name}</span>
                  ) : null}
                </button>
              ))}
            {dayGoogle
              .sort((a, b) => a.start.localeCompare(b.start))
              .map((e) => (
                <a
                  key={e.id}
                  href={e.link ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  title={`${e.calendarName} · ${e.ownerName} — פתיחה ב-Google Calendar`}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-right transition hover:border-slate-500"
                  style={{ borderInlineStartColor: e.color, borderInlineStartWidth: 3 }}
                >
                  <span className="font-mono text-xs text-slate-500">
                    {e.allDay ? "יום" : formatTime(e.start)}
                  </span>
                  <span className="flex-1 truncate text-sm text-slate-700">{e.title}</span>
                  <span className="text-[10px] text-slate-500">{e.ownerName}</span>
                </a>
              ))}
          </>
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
    </div>
  );
}
