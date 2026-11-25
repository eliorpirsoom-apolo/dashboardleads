"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/fetcher";
import { Button, Field, Input, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { useCollapse, CollapseBtn } from "@/components/settings/Collapse";
import WeeklyImportModal from "@/components/tasks/WeeklyImportModal";

// --- קטגוריות הדף (סדר קבוע, כמו על הדף הפיזי) -------------------------------
const CATEGORIES = [
  { key: "collect", label: "גבייה", icon: "💰" },
  { key: "meetings", label: "פגישות", icon: "📅" },
  { key: "office", label: "משימות משרד", icon: "🏢" },
  { key: "campaigns", label: "קמפיינים", icon: "📣" },
  { key: "shoots", label: "ימי צילום", icon: "🎬" },
  { key: "misc", label: "משימות שונות", icon: "📝" },
] as const;

type CatKey = (typeof CATEGORIES)[number]["key"];

interface Ref {
  id: string;
  name: string;
}

export interface WeeklyRow {
  id: string;
  category: string;
  title: string;
  note: string | null;
  at: string | null;
  done: boolean;
  doneAt: string | null;
  orderIndex: number;
  createdByName: string | null;
  client: { id: string; name: string; color: string | null } | null;
  project: { id: string; name: string } | null;
}

interface WeekData {
  weekStart: string;
  label: string;
  offset: number;
  nextWeekCount: number;
  tasks: WeeklyRow[];
}

const timeLabel = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" }).format(d);
};

export default function WeeklySheet({ clients }: { clients: Ref[] }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // --- הוספה מהירה -----------------------------------------------------------
  const [category, setCategory] = useState<CatKey>("misc");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<Ref[]>([]);
  const [title, setTitle] = useState("");
  const [addWeek, setAddWeek] = useState<"this" | "next">("this");
  const [adding, setAdding] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<WeekData>(`/api/weekly-tasks?offset=${offset}`);
      setData(d);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [offset]);
  useEffect(() => {
    load();
  }, [load]);

  // פרויקטים של הלקוח שנבחר בהוספה המהירה.
  useEffect(() => {
    if (!clientId) {
      setProjects([]);
      setProjectId("");
      return;
    }
    api<{ projects: { id: string; name: string; status: string }[] }>(`/api/projects?clientId=${clientId}`)
      .then((r) => setProjects(r.projects.filter((p) => p.status === "active")))
      .catch(() => setProjects([]));
  }, [clientId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setAdding(true);
    setError("");
    try {
      await api("/api/weekly-tasks", {
        method: "POST",
        json: { category, title: t, clientId: clientId || null, projectId: projectId || null, week: addWeek },
      });
      setTitle(""); // שומרים קטגוריה/לקוח/פרויקט — להזנה מהירה של כמה משימות ברצף
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  }

  // --- עדכון שורה (אופטימי) --------------------------------------------------
  const patchLocal = (id: string, patch: Partial<WeeklyRow>) =>
    setData((d) => (d ? { ...d, tasks: d.tasks.map((x) => (x.id === id ? { ...x, ...patch } : x)) } : d));

  async function toggleDone(row: WeeklyRow) {
    const next = !row.done;
    patchLocal(row.id, { done: next, doneAt: next ? new Date().toISOString() : null });
    try {
      await api(`/api/weekly-tasks/${row.id}`, { method: "PATCH", json: { done: next } });
    } catch (e: any) {
      setError(e.message);
      load();
    }
  }

  async function rename(row: WeeklyRow, newTitle: string) {
    const t = newTitle.trim();
    if (!t || t === row.title) return;
    patchLocal(row.id, { title: t });
    try {
      await api(`/api/weekly-tasks/${row.id}`, { method: "PATCH", json: { title: t } });
    } catch (e: any) {
      setError(e.message);
      load();
    }
  }

  async function moveWeek(row: WeeklyRow, week: "this" | "next") {
    setData((d) => (d ? { ...d, tasks: d.tasks.filter((x) => x.id !== row.id) } : d));
    try {
      await api(`/api/weekly-tasks/${row.id}`, { method: "PATCH", json: { moveWeek: week } });
      load();
    } catch (e: any) {
      setError(e.message);
      load();
    }
  }

  async function remove(row: WeeklyRow) {
    if (!confirm(`למחוק את "${row.title}"?`)) return;
    setData((d) => (d ? { ...d, tasks: d.tasks.filter((x) => x.id !== row.id) } : d));
    try {
      await api(`/api/weekly-tasks/${row.id}`, { method: "DELETE" });
    } catch (e: any) {
      setError(e.message);
      load();
    }
  }

  const byCategory = useMemo(() => {
    const m = new Map<string, WeeklyRow[]>();
    for (const t of data?.tasks ?? []) {
      const arr = m.get(t.category);
      if (arr) arr.push(t);
      else m.set(t.category, [t]);
    }
    return m;
  }, [data]);

  const total = data?.tasks.length ?? 0;
  const doneCount = data?.tasks.filter((t) => t.done).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* --- כותרת + ניווט שבועות --------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setOffset((o) => o - 1)} title="שבוע קודם">
            →
          </Button>
          <div className="min-w-[150px] text-center">
            <p className="text-xs text-slate-400">רשימת השבוע</p>
            <p className="text-sm font-bold text-slate-800">{data?.label ?? "…"}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOffset((o) => o + 1)} title="שבוע הבא">
            ←
          </Button>
          {offset !== 0 ? (
            <button onClick={() => setOffset(0)} className="mr-1 text-xs font-medium text-[#3a5bd9] hover:underline">
              היום
            </button>
          ) : null}
        </div>

        {total > 0 ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {doneCount}/{total} בוצעו
          </span>
        ) : null}

        {/* קפיצה לשבוע הבא כשיש משימות ממתינות (רק בתצוגת השבוע הנוכחי) */}
        {offset === 0 && (data?.nextWeekCount ?? 0) > 0 ? (
          <button
            onClick={() => setOffset(1)}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
            title="מעבר לשבוע הבא"
          >
            📥 ממתין לשבוע הבא ({data?.nextWeekCount})
          </button>
        ) : null}

        <div className="mr-auto flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-[#3a5bd9] hover:text-[#3a5bd9]"
            title="ייבוא משימות מקובץ Excel/CSV"
          >
            ⬆️ ייבוא
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-[#3a5bd9] hover:text-[#3a5bd9]"
            title="הדפסת רשימת השבוע"
          >
            🖨️ הדפסה
          </button>
        </div>
      </div>

      {/* --- הוספה מהירה ------------------------------------------------------ */}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="w-36">
          <Field label="קטגוריה">
            <Select value={category} onChange={(e) => setCategory(e.target.value as CatKey)}>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.icon} {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-40">
          <Field label="לקוח (רשות)">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— ללא —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-40">
          <Field label="פרויקט (רשות)">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!clientId}>
              <option value="">— ללא —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="min-w-[200px] flex-1">
          <Field label="משימה">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="מה צריך לעשות?" />
          </Field>
        </div>

        {/* בורר שבוע — להשבוע / לשבוע הבא */}
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
          {(["this", "next"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setAddWeek(w)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                addWeek === w ? "bg-[#3a5bd9] text-white" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {w === "this" ? "השבוע" : "השבוע הבא"}
            </button>
          ))}
        </div>

        <Button type="submit" disabled={adding || !title.trim()}>
          <Icon name="plus" className="h-4 w-4" />
          הוספה
        </Button>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {/* --- קטגוריות -------------------------------------------------------- */}
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">טוען…</p>
      ) : (
        <div className="weekly-print-area flex flex-col gap-3">
          {/* כותרת מודפסת — מופיעה רק בהדפסה */}
          <div className="hidden print:mb-1 print:block">
            <h1 className="text-lg font-bold text-slate-900">רשימת השבוע · {data?.label}</h1>
            <p className="text-xs text-slate-500">אפולו פרסום</p>
          </div>
          {CATEGORIES.map((c) => (
            <CategorySection
              key={c.key}
              cat={c}
              rows={byCategory.get(c.key) ?? []}
              offset={offset}
              onToggle={toggleDone}
              onRename={rename}
              onMoveWeek={moveWeek}
              onDelete={remove}
            />
          ))}
        </div>
      )}

      {showImport ? (
        <WeeklyImportModal
          defaultWeek={offset === 1 ? "next" : "this"}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

// --- מקטע קטגוריה (מתקפל) ----------------------------------------------------
function CategorySection({
  cat,
  rows,
  offset,
  onToggle,
  onRename,
  onMoveWeek,
  onDelete,
}: {
  cat: { key: CatKey; label: string; icon: string };
  rows: WeeklyRow[];
  offset: number;
  onToggle: (r: WeeklyRow) => void;
  onRename: (r: WeeklyRow, t: string) => void;
  onMoveWeek: (r: WeeklyRow, w: "this" | "next") => void;
  onDelete: (r: WeeklyRow) => void;
}) {
  const [collapsed, toggleCollapse] = useCollapse(`weekly-cat-${cat.key}`);
  const done = rows.filter((r) => r.done).length;

  // קיבוץ: לקוח → פרויקט (שמירה על סדר ההופעה).
  const clientGroups = useMemo(() => {
    const cm = new Map<string, { client: WeeklyRow["client"]; projects: Map<string, { project: WeeklyRow["project"]; tasks: WeeklyRow[] }> }>();
    for (const r of rows) {
      const ck = r.client?.id ?? "__none__";
      let cg = cm.get(ck);
      if (!cg) {
        cg = { client: r.client, projects: new Map() };
        cm.set(ck, cg);
      }
      const pk = r.project?.id ?? "__none__";
      let pg = cg.projects.get(pk);
      if (!pg) {
        pg = { project: r.project, tasks: [] };
        cg.projects.set(pk, pg);
      }
      pg.tasks.push(r);
    }
    return [...cm.values()].map((cg) => ({ client: cg.client, projects: [...cg.projects.values()] }));
  }, [rows]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        <span className="text-base">{cat.icon}</span>
        <h3 className="text-sm font-bold text-slate-800">{cat.label}</h3>
        {rows.length > 0 ? (
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
            {done}/{rows.length}
          </span>
        ) : null}
        <div className="mr-auto print-hidden">
          <CollapseBtn collapsed={collapsed} onClick={toggleCollapse} />
        </div>
      </header>

      <div className={collapsed ? "hidden print:block" : ""}>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-slate-300">— אין משימות —</p>
      ) : (
        <div className="flex flex-col gap-3 px-4 py-3">
          {clientGroups.map((cg, ci) => (
            <div key={cg.client?.id ?? `none-${ci}`} className="flex flex-col gap-1.5">
              {/* כותרת לקוח */}
              {cg.client ? (
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: cg.client.color ?? "#94a3b8" }} />
                  <span className="text-sm font-semibold text-slate-700">{cg.client.name}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="text-sm font-semibold text-slate-400">כללי / ללא לקוח</span>
                </div>
              )}

              {/* פרויקטים של אותו לקוח */}
              {cg.projects.map((pg, pi) => (
                <div key={pg.project?.id ?? `np-${pi}`} className="mr-4 flex flex-col gap-0.5 border-r-2 border-slate-100 pr-3">
                  {pg.project ? (
                    <div className="rounded-md bg-[#3a5bd9]/[0.07] px-2 py-1 text-xs font-bold text-[#3a5bd9]">
                      ▸ {pg.project.name}
                    </div>
                  ) : null}
                  <div className="flex flex-col">
                    {pg.tasks.map((r) => (
                      <TaskLine
                        key={r.id}
                        row={r}
                        offset={offset}
                        onToggle={onToggle}
                        onRename={onRename}
                        onMoveWeek={onMoveWeek}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      </div>
    </section>
  );
}

// --- שורת משימה -------------------------------------------------------------
function TaskLine({
  row,
  offset,
  onToggle,
  onRename,
  onMoveWeek,
  onDelete,
}: {
  row: WeeklyRow;
  offset: number;
  onToggle: (r: WeeklyRow) => void;
  onRename: (r: WeeklyRow, t: string) => void;
  onMoveWeek: (r: WeeklyRow, w: "this" | "next") => void;
  onDelete: (r: WeeklyRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.title);
  const time = timeLabel(row.at);

  function commit() {
    setEditing(false);
    onRename(row, draft);
  }

  return (
    <div className={`group flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-slate-50 ${row.done ? "opacity-55" : ""}`}>
      <button
        onClick={() => onToggle(row)}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
          row.done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-slate-300 text-transparent hover:border-[#3a5bd9]"
        }`}
        title={row.done ? "ביטול סימון" : "סימון כבוצע"}
      >
        <Icon name="check" className="h-3 w-3" />
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(row.title);
              setEditing(false);
            }
          }}
          className="flex-1 rounded border border-[#3a5bd9]/40 bg-white px-1.5 py-0.5 text-sm text-slate-800 outline-none"
        />
      ) : (
        <button
          onDoubleClick={() => {
            setDraft(row.title);
            setEditing(true);
          }}
          className={`min-w-0 flex-1 truncate text-right text-sm text-slate-700 ${row.done ? "line-through" : ""}`}
          title={row.note ?? "לחיצה כפולה לעריכה"}
        >
          {row.title}
          {time ? <span className="mr-1.5 text-xs text-slate-400">· {time}</span> : null}
          {row.createdByName ? <span className="mr-1.5 text-[11px] text-slate-300">· {row.createdByName}</span> : null}
        </button>
      )}

      {/* פעולות — מופיעות ב-hover, לא מודפסות */}
      <div className="print-hidden flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
        {offset === 0 ? (
          <button onClick={() => onMoveWeek(row, "next")} className="rounded p-1 text-slate-400 hover:text-amber-600" title="דחייה לשבוע הבא">
            <span className="text-xs">📥</span>
          </button>
        ) : offset === 1 ? (
          <button onClick={() => onMoveWeek(row, "this")} className="rounded p-1 text-slate-400 hover:text-[#3a5bd9]" title="הקדמה לשבוע הנוכחי">
            <span className="text-xs">📤</span>
          </button>
        ) : null}
        <button
          onClick={() => {
            setDraft(row.title);
            setEditing(true);
          }}
          className="rounded p-1 text-slate-400 hover:text-[#3a5bd9]"
          title="עריכה"
        >
          <Icon name="edit" className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDelete(row)} className="rounded p-1 text-slate-400 hover:text-red-600" title="מחיקה">
          <Icon name="trash" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
