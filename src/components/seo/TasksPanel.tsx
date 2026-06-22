"use client";

import { useState } from "react";
import type { SeoTaskDTO } from "@/lib/seoTypes";

function monthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split("-").map(Number);
  if (!y || !m) return yyyyMM;
  return new Date(y, m - 1, 1).toLocaleDateString("he-IL", {
    month: "long",
    year: "numeric",
  });
}

function TaskList({
  tasks,
  tone,
  emptyText,
  onDelete,
}: {
  tasks: SeoTaskDTO[];
  tone: "done" | "planned";
  emptyText: string;
  onDelete: (id: string) => void;
}) {
  const ring =
    tone === "done"
      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
      : "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30";
  const mark = tone === "done" ? "✓" : "→";

  if (tasks.length === 0) {
    return <p className="mt-3 text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <ul className="mt-3 space-y-2">
      {tasks.map((t) => (
        <li
          key={t.id}
          className="group flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-slate-900/40 px-3 py-2"
        >
          <span className="flex items-center gap-2.5 text-sm text-slate-200">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ${ring}`}
            >
              {mark}
            </span>
            {t.title}
          </span>
          <button
            onClick={() => onDelete(t.id)}
            className="no-print text-xs text-slate-500 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
            aria-label="מחק משימה"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function TasksPanel({
  clientId,
  thisMonth,
  nextMonth,
  tasksDone,
  tasksPlanned,
  onChanged,
}: {
  clientId: string;
  thisMonth: string;
  nextMonth: string;
  tasksDone: SeoTaskDTO[];
  tasksPlanned: SeoTaskDTO[];
  onChanged: () => void;
}) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"done" | "planned">("done");
  const [saving, setSaving] = useState(false);

  async function addTask() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await fetch("/api/seo/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          title: trimmed,
          status,
          dueMonth: status === "done" ? thisMonth : nextMonth,
        }),
      });
      setTitle("");
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask(id: string) {
    await fetch(`/api/seo/tasks/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <span className="text-lg">🗂️</span>
        <h3 className="text-lg font-semibold text-slate-100">
          משימות קידום אורגני
        </h3>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold text-emerald-300">
            בוצע — {monthLabel(thisMonth)}
          </h4>
          <TaskList
            tasks={tasksDone}
            tone="done"
            emptyText="טרם נרשמו משימות שבוצעו החודש."
            onDelete={deleteTask}
          />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-cyan-300">
            מתוכנן — {monthLabel(nextMonth)}
          </h4>
          <TaskList
            tasks={tasksPlanned}
            tone="planned"
            emptyText="טרם נרשמו משימות לחודש הבא."
            onDelete={deleteTask}
          />
        </div>
      </div>

      {/* Editor — hidden when printing/exporting the report. */}
      <div className="no-print mt-5 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="הוספת משימה…"
          className="flex-1 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "done" | "planned")}
          className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-400/60"
        >
          <option value="done">בוצע ({monthLabel(thisMonth)})</option>
          <option value="planned">מתוכנן ({monthLabel(nextMonth)})</option>
        </select>
        <button
          onClick={addTask}
          disabled={saving || !title.trim()}
          className="btn-neon rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-60"
        >
          הוסף
        </button>
      </div>
    </div>
  );
}
