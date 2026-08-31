"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatTime } from "@/lib/format";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { TaskFormModal, type TaskRow } from "./TasksView";

const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

// שכבות היומן לפי סוג משימה — צבע ותווית אחידים בכל התצוגות.
const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  task: { label: "משימות", color: "#06b6d4", icon: "✅" },
  meeting: { label: "פגישות", color: "#8b5cf6", icon: "📅" },
  callback: { label: "חזרות ללידים", color: "#f59e0b", icon: "📞" },
  contract: { label: "חוזים", color: "#10b981", icon: "📝" },
};
const typeMeta = (t: string) => TYPE_META[t] ?? TYPE_META.task;

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
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

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
      if (hiddenTypes.has(t.type)) continue;
      (map[ymd(new Date(t.dueAt))] ??= []).push(t);
    }
    // בתוך כל יום — סדר כרונולוגי לפי שעה.
    for (const list of Object.values(map)) {
      list.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    }
    return map;
  }, [tasks, hiddenTypes]);

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
    // בתוך כל יום — סדר כרונולוגי (אירועי יום-שלם ראשונים, אח"כ לפי שעה).
    for (const list of Object.values(map)) {
      list.sort((a, b) => a.start.localeCompare(b.start));
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

      {/* שכבות: סינון לפי סוג — לחיצה מסתירה/מציגה */}
      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5">
        <span className="text-xs font-medium text-slate-400">שכבות:</span>
        {Object.entries(TYPE_META).map(([key, m]) => (
          <button
            key={key}
            onClick={() => {
              const next = new Set(hiddenTypes);
              next.has(key) ? next.delete(key) : next.add(key);
              setHiddenTypes(next);
            }}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
              hiddenTypes.has(key)
                ? "border-slate-200 text-slate-400 line-through"
                : "border-slate-300 text-slate-700"
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
            {m.icon} {m.label}
          </button>
        ))}
      </div>

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
            // מיזוג משימות + אירועי Google לרצף כרונולוגי אחד לפי שעה.
            const merged = [
              ...(byDay[key] ?? []).map((t) => ({ kind: "task" as const, at: t.dueAt, t, e: null as GoogleEvent | null })),
              ...(googleByDay[key] ?? []).map((e) => ({ kind: "g" as const, at: e.start, t: null as TaskRow | null, e })),
            ].sort((a, b) => a.at.localeCompare(b.at));
            const shownItems = merged.slice(0, 3);
            const extra = merged.length - shownItems.length;
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
                  {shownItems.map((item) =>
                    item.kind === "task" && item.t ? (
                      <span
                        key={item.t.id}
                        className={`truncate rounded px-1 text-[10px] leading-4 ${item.t.status === "done" ? "line-through opacity-50" : ""}`}
                        style={{
                          backgroundColor: `${typeMeta(item.t.type).color}22`,
                          color: typeMeta(item.t.type).color,
                        }}
                      >
                        {item.t.title}
                      </span>
                    ) : item.e ? (
                      <span
                        key={item.e.id}
                        className="truncate rounded px-1 text-[10px] leading-4 text-slate-700"
                        style={{ backgroundColor: `${item.e.color}2e` }}
                      >
                        {item.e.title}
                      </span>
                    ) : null
                  )}
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
          // רצף כרונולוגי אחד: משימות המערכת ואירועי Google משולבים לפי שעה.
          [
            ...dayTasks.map((t) => ({ kind: "task" as const, at: t.dueAt, t, e: null as GoogleEvent | null })),
            ...dayGoogle.map((e) => ({ kind: "g" as const, at: e.start, t: null as TaskRow | null, e })),
          ]
            .sort((a, b) => a.at.localeCompare(b.at))
            .map((item) =>
              item.kind === "task" && item.t ? (
                <button
                  key={item.t.id}
                  onClick={() => setEditTask(item.t)}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-right transition hover:border-cyan-500/40"
                  style={{ borderInlineStartColor: typeMeta(item.t.type).color, borderInlineStartWidth: 3 }}
                >
                  <span className="font-mono text-xs text-slate-500">{formatTime(item.t.dueAt)}</span>
                  <span className="text-xs">{typeMeta(item.t.type).icon}</span>
                  <span className={`flex-1 truncate text-sm text-slate-700 ${item.t.status === "done" ? "line-through opacity-60" : ""}`}>
                    {item.t.title}
                    {item.t.lead ? (
                      <span className="text-[10px] text-slate-500"> · ליד #{item.t.lead.number} {item.t.lead.fullName ?? ""}</span>
                    ) : null}
                  </span>
                  {isAdmin && item.t.client ? (
                    <span className="text-[10px] text-slate-500">{item.t.client.name}</span>
                  ) : null}
                </button>
              ) : item.e ? (
                <a
                  key={item.e.id}
                  href={item.e.link ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  title={`${item.e.calendarName} · ${item.e.ownerName} — פתיחה ב-Google Calendar`}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-right transition hover:border-slate-500"
                  style={{ borderInlineStartColor: item.e.color, borderInlineStartWidth: 3 }}
                >
                  <span className="font-mono text-xs text-slate-500">
                    {item.e.allDay ? "יום" : formatTime(item.e.start)}
                  </span>
                  <span className="flex-1 truncate text-sm text-slate-700">{item.e.title}</span>
                  <span className="text-[10px] text-slate-500">{item.e.ownerName}</span>
                </a>
              ) : null
            )
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
