"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
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
  DESIGN_PRIORITY_COLORS,
} from "@/lib/studio";

interface Opt {
  id: string;
  name: string;
  color?: string | null;
  calendarConnected?: boolean;
}
interface DTask {
  id: string;
  title: string;
  briefType: string;
  priority: string;
  status: string;
  scheduledAt: string | null;
  durationMin: number | null;
  dueAt: string | null;
  gcalState: string;
  gcalError: string | null;
  overdue: boolean;
  round: number;
  groupId: string | null;
  orderIndex: number;
  client: { id: string; name: string; color: string | null } | null;
  designer: { id: string; name: string } | null;
  _count?: { assets: number; feedback: number };
}
interface Group {
  id: string;
  name: string;
  color: string | null;
  orderIndex: number;
}

const PRIORITY_COLOR = DESIGN_PRIORITY_COLORS;
// פלטת צבעים לכותרות קבוצות (לפי סדר), אם לא הוגדר צבע.
const GROUP_PALETTE = ["#38bdf8", "#a78bfa", "#34d399", "#f59e0b", "#f472b6", "#22d3ee", "#fb7185", "#84cc16"];

export default function StudioBoard({
  clients,
  designers,
  meId,
}: {
  clients: Opt[];
  designers: Opt[];
  meId?: string | null;
}) {
  const [tasks, setTasks] = useState<DTask[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [designerFilter, setDesignerFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "capacity">("table");
  const [groups, setGroups] = useState<Group[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null); // `${groupKey}:${taskId|"end"}`
  const [dragGroupId, setDragGroupId] = useState<string | null>(null); // גרירת בלוק-קבוצה
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  // גרירת שורה נחמשת רק מהידית ⠿ (mousedown עליה) — שלא תתנגש עם שדות בשורה.
  const [dragArmed, setDragArmed] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  useEffect(() => {
    const clear = () => setDragArmed((v) => (v ? null : v));
    window.addEventListener("mouseup", clear);
    return () => window.removeEventListener("mouseup", clear);
  }, []);
  const [createGroupId, setCreateGroupId] = useState<string | null>(null); // קבוצה מוגדרת-מראש בבריף חדש

  const load = useCallback(async () => {
    const q = designerFilter ? `?designerId=${designerFilter}` : "";
    const d = await api<{ tasks: DTask[] }>(`/api/design-tasks${q}`);
    setTasks(d.tasks);
  }, [designerFilter]);

  const loadGroups = useCallback(async () => {
    const d = await api<{ groups: Group[] }>("/api/design-groups");
    setGroups(d.groups);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadGroups();
  }, [loadGroups]);
  // קישור עומק מהתראת תיוג: /admin/studio?task=<id> פותח את המשימה ישירות.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("task");
    if (id) setOpenId(id);
  }, []);

  async function patch(id: string, data: Record<string, unknown>) {
    await api(`/api/design-tasks/${id}`, { method: "PATCH", json: data });
    load();
  }
  async function del(id: string) {
    if (!confirm("למחוק את משימת העיצוב?")) return;
    await api(`/api/design-tasks/${id}`, { method: "DELETE" });
    load();
  }

  async function addGroup() {
    const name = prompt("שם הקבוצה החדשה:");
    if (!name?.trim()) return;
    await api("/api/design-groups", { method: "POST", json: { name: name.trim() } });
    loadGroups();
  }
  async function renameGroup(g: Group) {
    const name = prompt("שם הקבוצה:", g.name);
    if (!name?.trim() || name.trim() === g.name) return;
    await api(`/api/design-groups/${g.id}`, { method: "PATCH", json: { name: name.trim() } });
    loadGroups();
  }
  async function deleteGroup(g: Group) {
    if (!confirm(`למחוק את הקבוצה ״${g.name}״? המשימות יעברו ל״ללא קבוצה״ (לא יימחקו).`)) return;
    await api(`/api/design-groups/${g.id}`, { method: "DELETE" });
    await loadGroups();
    load();
  }

  const groupIds = new Set(groups.map((g) => g.id));
  const effGroup = (t: DTask): string | null => (t.groupId && groupIds.has(t.groupId) ? t.groupId : null);
  const byOrder = (a: DTask, b: DTask) => a.orderIndex - b.orderIndex || (a.title < b.title ? -1 : 1);
  // מיון בלחיצה על כותרת עמודה: לפי סטטוס (סדר שלבי העבודה) או לפי מועד בלו"ז.
  const [statusSort, setStatusSort] = useState(false);
  const [timeSort, setTimeSort] = useState(false);
  const bySort = (a: DTask, b: DTask) =>
    statusSort
      ? DESIGN_STATUSES.indexOf(a.status as any) - DESIGN_STATUSES.indexOf(b.status as any) || byOrder(a, b)
      : timeSort
        ? (a.scheduledAt || "z").localeCompare(b.scheduledAt || "z") || byOrder(a, b)
        : byOrder(a, b);
  // גרירה מושבתת בזמן סינון/מיון (שלא לשבש סדר של פריטים מוסתרים)
  const dndEnabled = !designerFilter && !statusSort && !timeSort;

  // משכי עבודה לבחירה — חצי שעה עד יום עבודה.
  const DURATIONS: { v: number; l: string }[] = [
    { v: 30, l: "חצי שעה" },
    { v: 60, l: "שעה" },
    { v: 90, l: "שעה וחצי" },
    { v: 120, l: "שעתיים" },
    { v: 180, l: "3 שעות" },
    { v: 240, l: "4 שעות" },
    { v: 300, l: "5 שעות" },
    { v: 360, l: "6 שעות" },
    { v: 480, l: "8 שעות" },
  ];

  async function handleGroupDrop(targetGroupId: string) {
    const id = dragGroupId;
    setDragGroupId(null);
    setDragOverGroupId(null);
    if (!id || !dndEnabled || id === targetGroupId) return;
    const order = groups.map((g) => g.id).filter((x) => x !== id);
    const idx = order.indexOf(targetGroupId);
    const at = idx < 0 ? order.length : idx;
    const newOrder = [...order.slice(0, at), id, ...order.slice(at)];
    try {
      await api("/api/design-groups/reorder", { method: "POST", json: { groupIds: newOrder } });
    } finally {
      loadGroups();
    }
  }

  function openCreateInGroup(groupId: string | null) {
    setCreateGroupId(groupId);
    setShowCreate(true);
  }

  async function handleDrop(targetGroupId: string | null, beforeTaskId: string | null) {
    const id = dragId;
    setDragId(null);
    setDragOver(null);
    if (!id || !dndEnabled) return;
    const current = tasks.filter((t) => effGroup(t) === targetGroupId).sort(byOrder);
    const without = current.filter((t) => t.id !== id);
    const foundIdx = beforeTaskId ? without.findIndex((t) => t.id === beforeTaskId) : -1;
    const idx = beforeTaskId && foundIdx >= 0 ? foundIdx : without.length;
    const newOrder = [...without.slice(0, idx).map((t) => t.id), id, ...without.slice(idx).map((t) => t.id)];
    try {
      await api("/api/design-tasks/reorder", { method: "POST", json: { groupId: targetGroupId, taskIds: newOrder } });
    } finally {
      load();
    }
  }
  function toLocalInput(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  }
  const selCls =
    "w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700";

  // מעצבות שיש להן משימות משויכות אך יומן ה-Google שלהן לא מחובר — הלו"ז לא יסתנכרן.
  const assignedIds = new Set(tasks.map((t) => t.designer?.id).filter(Boolean) as string[]);
  const unlinked = designers.filter(
    (d) => assignedIds.has(d.id) && d.calendarConnected === false
  );

  const gidOf = (key: string): string | null => (key === "none" ? null : key);
  const sections = [
    ...groups.map((g, i) => ({
      key: g.id,
      group: g as Group | null,
      color: g.color || GROUP_PALETTE[i % GROUP_PALETTE.length],
      items: tasks.filter((t) => effGroup(t) === g.id).sort(bySort),
    })),
    { key: "none", group: null as Group | null, color: "#64748b", items: tasks.filter((t) => effGroup(t) === null).sort(bySort) },
  ];

  // 11 עמודות בפריסה קבועה — כל בלוקי הקבוצות מיושרים לאותו גריד, בלי גלילה
  // אופקית נפרדת פר-קבוצה. העמודה הראשונה (משימה) גמישה וסופגת את השאר.
  // רוחבי העמודות ניתנים לשינוי בגרירת הידית שבקצה כל כותרת (כמו באקסל) ונשמרים מקומית.
  const COLS = 12;
  // גרסת המפתח (v2) מאפסת רוחבים שמורים כשברירות המחדל מכווננות מחדש.
  const COL_WIDTHS_KEY = "studio-col-widths-v4";
  // כל 11 העמודות ברוחב קבוע וניתן לגרירה (כולל "משימה"); עמודת-מילוי ריקה בסוף סופגת את שאר המסך.
  const DEFAULT_COL_WIDTHS = [240, 104, 124, 100, 118, 148, 76, 44, 148, 84, 36];
  const [colW, setColW] = useState<number[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const s = JSON.parse(localStorage.getItem(COL_WIDTHS_KEY) || "null");
        if (Array.isArray(s) && s.length === DEFAULT_COL_WIDTHS.length && s.every((n) => Number.isFinite(n))) return s;
      } catch {
        /* ברירת מחדל */
      }
    }
    return DEFAULT_COL_WIDTHS;
  });
  const resizeRef = useRef<{ idx: number; startX: number; startW: number } | null>(null);
  function startResize(idx: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { idx, startX: e.clientX, startW: colW[idx] };
    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      // RTL: גרירה שמאלה מרחיבה את העמודה.
      const delta = r.startX - ev.clientX;
      setColW((prev) => {
        const next = [...prev];
        next[r.idx] = Math.min(440, Math.max(40, r.startW + delta));
        return next;
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      resizeRef.current = null;
      setColW((prev) => {
        try {
          localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(prev));
        } catch {
          /* לא קריטי */
        }
        return prev;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  // ידית שינוי-רוחב בקצה השמאלי של כותרת (i = אינדקס בעמודות 0..9 של colW).
  const Resizer = ({ i }: { i: number }) => (
    <span
      onMouseDown={(e) => startResize(i, e)}
      onClick={(e) => e.stopPropagation()}
      title="גרירה לשינוי רוחב העמודה"
      className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-[#3a5bd9]/40"
    />
  );
  const colGroup = (
    <colgroup>
      {colW.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
      <col /> {/* עמודת מילוי — סופגת את שארית הרוחב */}
    </colgroup>
  );

  const renderTaskRow = (t: DTask, groupKey: string) => (
    <tr
      key={t.id}
      // גרירה נבנית מהידית ⠿ בלבד (dragArmed) — כך שדות הטקסט והבחירה בשורה לא מפריעים.
      draggable={dndEnabled && dragArmed === t.id}
      onDragStart={() => setDragId(t.id)}
      onDragEnd={() => { setDragId(null); setDragOver(null); setDragArmed(null); }}
      onDragOver={(e) => { if (!dndEnabled || !dragId) return; e.preventDefault(); setDragOver(`${groupKey}:${t.id}`); }}
      onDrop={(e) => { if (!dndEnabled || !dragId) return; e.preventDefault(); handleDrop(gidOf(groupKey), t.id); }}
      className={`border-b border-slate-100 align-middle hover:bg-slate-50 ${dragId === t.id ? "opacity-40" : ""} ${dragOver === `${groupKey}:${t.id}` ? "border-t-2 border-t-cyan-400" : ""}`}
    >
      <td className="px-3 py-2">
        <div className="group/title flex min-w-0 items-center gap-2">
          {dndEnabled ? (
            <span
              onMouseDown={() => setDragArmed(t.id)}
              className="shrink-0 cursor-grab select-none text-slate-400 transition hover:text-[#3a5bd9]"
              title="גרירה — בתוך הקבוצה או לקבוצה אחרת"
            >
              ⠿
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {editingTitleId === t.id ? (
              <input
                autoFocus
                defaultValue={t.title}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  else if (e.key === "Escape") { setEditingTitleId(null); }
                }}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  setEditingTitleId(null);
                  if (v && v !== t.title) patch(t.id, { title: v });
                }}
                className="w-full rounded-lg border border-[#3a5bd9] bg-white px-2 py-1 text-sm font-medium text-slate-800 focus:outline-none"
              />
            ) : (
              <span className="flex items-center gap-1">
                <button
                  onClick={() => setOpenId(t.id)}
                  title={t.title}
                  className="block max-w-full truncate text-right font-medium text-slate-800 hover:text-[#3a5bd9]"
                >
                  {t.title}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingTitleId(t.id); }}
                  title="שינוי שם מהיר"
                  className="shrink-0 rounded p-0.5 text-slate-300 opacity-0 transition group-hover/title:opacity-100 hover:text-[#3a5bd9]"
                >
                  <Icon name="edit" className="h-3 w-3" />
                </button>
              </span>
            )}
            {t.overdue || t.round > 1 ? (
              <div className="mt-1 flex gap-1">
                {t.overdue ? <Chip color="#f87171">באיחור</Chip> : null}
                {t.round > 1 ? <Chip color="#f97316">סבב {t.round}</Chip> : null}
              </div>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-2 py-2">
        {t.client ? (
          <span
            className="block max-w-full truncate rounded-full px-2 py-0.5 text-center text-[11px] font-medium"
            title={t.client.name}
            style={{ color: t.client.color ?? "#64748b", backgroundColor: `${t.client.color ?? "#64748b"}1a` }}
          >
            {t.client.name}
          </span>
        ) : (
          <span className="block text-center text-slate-400">—</span>
        )}
      </td>
      <td className="px-2 py-2">
        <select
          value={t.status}
          onChange={(e) => patch(t.id, { status: e.target.value })}
          className={`${selCls} font-medium`}
          style={{
            borderColor: DESIGN_STATUS_COLORS[t.status],
            color: DESIGN_STATUS_COLORS[t.status],
            backgroundColor: `${DESIGN_STATUS_COLORS[t.status]}14`,
          }}
        >
          {DESIGN_STATUSES.map((s) => (
            <option key={s} value={s} style={{ color: "#0f172a" }}>
              {s === "scheduled" && t.status === "scheduled" && t.gcalState === "synced"
                ? "תוזמנה בלוז ✓"
                : DESIGN_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <select
          value={t.priority}
          onChange={(e) => patch(t.id, { priority: e.target.value })}
          className={`${selCls} font-medium`}
          style={{
            borderColor: PRIORITY_COLOR[t.priority],
            color: PRIORITY_COLOR[t.priority],
            backgroundColor: `${PRIORITY_COLOR[t.priority]}14`,
          }}
        >
          {DESIGN_PRIORITIES.map((p) => (
            <option key={p.value} value={p.value} style={{ color: "#0f172a" }}>{p.label}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <select value={t.designer?.id ?? ""} onChange={(e) => patch(t.id, { designerId: e.target.value || null })} className={selCls}>
          <option value="">— לא משויך —</option>
          {designers.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
      </td>
      <td className="px-2 py-2">
        <input type="datetime-local" dir="ltr" value={toLocalInput(t.scheduledAt)}
          onChange={(e) => patch(t.id, { scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
          className={selCls} />
      </td>
      <td className="px-2 py-2">
        <select
          value={t.durationMin ?? 60}
          onChange={(e) => patch(t.id, { durationMin: Number(e.target.value) })}
          className={selCls}
          title="משך העבודה — קובע את אורך האירוע ביומן המעצב/ת"
        >
          {DURATIONS.map((d) => (<option key={d.v} value={d.v}>{d.l}</option>))}
        </select>
      </td>
      <td className="px-1 py-2 text-center">
        {!t.designer || !t.scheduledAt ? (
          <span className="text-xs text-slate-300" title="אין מעצב/ת או מועד — אין מה לתזמן ביומן">—</span>
        ) : t.gcalState === "synced" ? (
          <span title="המשימה ביומן ה-Google של המעצב/ת (אומת)">🟢</span>
        ) : t.gcalState === "blocked" ? (
          <span title={t.gcalError ?? "לא ניתן לתזמן ביומן"}>🔴</span>
        ) : (
          <span title="ממתין לסנכרון ליומן — ינוסה שוב אוטומטית תוך דקות">🟡</span>
        )}
      </td>
      <td className="px-2 py-2">
        <input type="datetime-local" dir="ltr" value={toLocalInput(t.dueAt)}
          onChange={(e) => patch(t.id, { dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
          className={selCls} title="דדליין ללקוח — ניתן לשינוי" />
      </td>
      <td className="truncate px-2 py-2 text-xs text-slate-600">{briefTypeLabel(t.briefType)}</td>
      <td className="px-3 py-2 text-left">
        <button onClick={() => del(t.id)} title="מחיקה" className="text-slate-600 transition hover:text-rose-400">
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </td>
      <td className="px-0 py-2"></td>
    </tr>
  );

  // שורת כותרות-העמודות (חוזרת בכל בלוק-קבוצה, כמו במאנדיי).
  const columnsHead = (
    <thead>
      <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
        <th className="relative px-3 py-2 text-right font-medium">משימה<Resizer i={0} /></th>
        <th className="relative px-2 py-2 text-right font-medium">לקוח<Resizer i={1} /></th>
        <th className="relative px-2 py-2 text-right font-medium">
          <button
            type="button"
            onClick={() => { setStatusSort((v) => !v); setTimeSort(false); }}
            className={`flex items-center gap-1 transition ${statusSort ? "font-bold text-[#3a5bd9]" : "hover:text-slate-700"}`}
            title={statusSort ? "ביטול מיון לפי סטטוס (חזרה לסדר הידני)" : "מיון לפי סטטוס"}
          >
            סטטוס {statusSort ? "↓" : "⇅"}
          </button>
          <Resizer i={2} />
        </th>
        <th className="relative px-2 py-2 text-right font-medium">עדיפות<Resizer i={3} /></th>
        <th className="relative px-2 py-2 text-right font-medium">מעצב/ת<Resizer i={4} /></th>
        <th className="relative px-2 py-2 text-right font-medium">
          <button
            type="button"
            onClick={() => { setTimeSort((v) => !v); setStatusSort(false); }}
            className={`flex items-center gap-1 transition ${timeSort ? "font-bold text-[#3a5bd9]" : "hover:text-slate-700"}`}
            title={timeSort ? "ביטול מיון כרונולוגי (חזרה לסדר הידני)" : "מיון כרונולוגי לפי מועד בלו״ז"}
          >
            מתוזמן ללו״ז {timeSort ? "↓" : "⇅"}
          </button>
          <Resizer i={5} />
        </th>
        <th className="relative px-2 py-2 text-right font-medium">משך<Resizer i={6} /></th>
        <th className="relative px-1 py-2 text-center font-medium" title="האם המשימה נמצאת בפועל ביומן ה-Google של המעצב/ת">בלוז<Resizer i={7} /></th>
        <th className="relative px-2 py-2 text-right font-medium">דדליין<Resizer i={8} /></th>
        <th className="relative px-2 py-2 text-right font-medium">סוג<Resizer i={9} /></th>
        <th className="relative px-1 py-2"><Resizer i={10} /></th>
        <th className="px-0 py-2"></th>
      </tr>
    </thead>
  );

  // בלוק-קבוצה עצמאי: כותרת + טבלה משלו (עמודות משלו), ניתן לכיווץ ולגרירה.
  const renderGroupBlock = (sec: { key: string; group: Group | null; color: string; items: DTask[] }) => {
    const isCollapsed = !!collapsed[sec.key];
    const isGroup = !!sec.group;
    return (
      <Card key={sec.key} className="!p-0 overflow-hidden">
        <div
          draggable={isGroup && dndEnabled}
          onDragStart={isGroup ? () => setDragGroupId(sec.group!.id) : undefined}
          onDragEnd={() => { setDragGroupId(null); setDragOverGroupId(null); }}
          onDragOver={(e) => {
            // כותרת קבוצה מקבלת גם גרירת קבוצות (סידור בלוקים) וגם גרירת משימות (העברה לראש הקבוצה).
            if (dragGroupId && isGroup) { e.preventDefault(); setDragOverGroupId(sec.group!.id); }
            else if (dragId) { e.preventDefault(); setDragOver(`${sec.key}:top`); }
          }}
          onDrop={(e) => {
            if (dragGroupId && isGroup) { e.preventDefault(); handleGroupDrop(sec.group!.id); }
            else if (dragId) { e.preventDefault(); handleDrop(gidOf(sec.key), sec.items[0]?.id ?? null); }
          }}
          onDragLeave={() => setDragOver((v) => (v === `${sec.key}:top` ? null : v))}
          className={`flex items-center gap-2 px-3 py-2.5 ${dragOverGroupId === sec.group?.id || dragOver === `${sec.key}:top` ? "bg-cyan-500/10" : ""} ${dragGroupId === sec.group?.id ? "opacity-40" : ""}`}
          style={{ boxShadow: `inset 4px 0 0 ${sec.color}` }}
        >
          {isGroup && dndEnabled ? <span className="cursor-grab select-none text-slate-600" title="גרירת קבוצה">⠿</span> : null}
          <button onClick={() => setCollapsed((p) => ({ ...p, [sec.key]: !p[sec.key] }))} className="text-slate-400 hover:text-slate-900">
            {isCollapsed ? "▸" : "▾"}
          </button>
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sec.color }} />
          <span className="font-bold text-slate-800">{sec.group ? sec.group.name : "ללא קבוצה"}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-400">{sec.items.length}</span>
          <span className="mr-auto flex items-center gap-3">
            <button onClick={() => openCreateInGroup(gidOf(sec.key))} title="הוספת משימה לקבוצה" className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-700">
              <Icon name="plus" className="h-3.5 w-3.5" /> משימה
            </button>
            {isGroup ? (
              <>
                <button onClick={() => renameGroup(sec.group!)} title="שינוי שם" className="text-slate-500 hover:text-cyan-700"><Icon name="edit" className="h-3.5 w-3.5" /></button>
                <button onClick={() => deleteGroup(sec.group!)} title="מחיקת קבוצה" className="text-slate-500 hover:text-rose-400"><Icon name="trash" className="h-3.5 w-3.5" /></button>
              </>
            ) : null}
          </span>
        </div>
        {!isCollapsed ? (
          <div className="border-t border-slate-200">
            <table className="w-full table-fixed text-right text-sm">
              {colGroup}
              {columnsHead}
              <tbody>
                {sec.items.map((t) => renderTaskRow(t, sec.key))}
                {dndEnabled && dragId ? (
                  <tr
                    onDragOver={(e) => { if (dragGroupId) return; e.preventDefault(); setDragOver(`${sec.key}:end`); }}
                    onDrop={(e) => { if (dragGroupId) return; e.preventDefault(); handleDrop(gidOf(sec.key), null); }}
                  >
                    <td colSpan={COLS} className={`px-3 py-2 text-center text-[11px] ${dragOver === `${sec.key}:end` ? "bg-cyan-500/10 text-cyan-700" : "text-slate-500"}`}>
                      גררו לכאן להוספה לקבוצה
                    </td>
                  </tr>
                ) : sec.items.length === 0 ? (
                  <tr><td colSpan={COLS} className="px-3 py-3 text-center text-[11px] text-slate-500">אין משימות בקבוצה</td></tr>
                ) : null}
                <tr>
                  <td colSpan={COLS} className="border-t border-slate-100 px-3 py-1.5">
                    <QuickAddTask
                      groupId={gidOf(sec.key)}
                      clients={clients}
                      onAdded={load}
                      onFullBrief={() => openCreateInGroup(gidOf(sec.key))}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => openCreateInGroup(null)}>
          <Icon name="plus" className="h-4 w-4" />
          בריף חדש
        </Button>
        <select
          value={designerFilter}
          onChange={(e) => setDesignerFilter(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
        >
          <option value="">כל המעצבים</option>
          {designers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <div className="mr-auto flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs">
          <button
            onClick={() => setView("table")}
            className={`rounded px-2.5 py-1 ${view === "table" ? "bg-[#3a5bd9] text-white" : "text-slate-500 hover:text-slate-700"}`}
          >
            טבלה
          </button>
          <button
            onClick={() => setView("capacity")}
            className={`rounded px-2.5 py-1 ${view === "capacity" ? "bg-[#3a5bd9] text-white" : "text-slate-500 hover:text-slate-700"}`}
          >
            עומס מעצבות
          </button>
        </div>
      </div>

      {unlinked.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          ⚠️ יומן Google לא מחובר עבור: <b>{unlinked.map((d) => d.name).join(", ")}</b>. התזמון יופיע
          בלו״ז המערכת, אך לא יסתנכרן ליומן ה-Google שלהן. לחיבור — כל מעצב/ת מתחבר/ת פעם אחת דרך ״הגדרות ← יומן Google״.
        </div>
      ) : null}

      {view === "table" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              {dndEnabled
                ? "גררו משימות ⠿ בתוך/בין קבוצות · גררו כותרת קבוצה ⠿ לשינוי סדר הבלוקים"
                : "בטלו סינון מעצב/ת כדי לגרור ולסדר"}
            </p>
            <Button size="sm" variant="ghost" onClick={addGroup} className="!border-slate-300 !text-slate-600 hover:!border-[#3a5bd9] hover:!text-[#3a5bd9]">
              <Icon name="plus" className="h-4 w-4" />
              קבוצה חדשה
            </Button>
          </div>
          {tasks.length === 0 && groups.length === 0 ? (
            <Card>
              <p className="py-8 text-center text-sm text-slate-600">אין משימות עיצוב עדיין. לחצו על ״בריף חדש״ או ״קבוצה חדשה״.</p>
            </Card>
          ) : null}
          {/* מיכל גלילה אחד לכל הבלוקים — כל הקבוצות מיושרות לאותו גריד עמודות.
              הרוחב המינימלי גדל עם הרחבת עמודות (כמו באקסל) כדי שעמודת המשימה לא תימחץ. */}
          <div className="overflow-x-auto pb-1">
            <div className="flex flex-col gap-3" style={{ minWidth: 24 + colW.reduce((a, b) => a + b, 0) }}>
              {sections.map((sec) => {
                // מציגים את "ללא קבוצה" רק אם יש בו משימות או שאין קבוצות כלל.
                if (sec.key === "none" && sec.items.length === 0 && groups.length > 0) return null;
                return <Fragment key={sec.key}>{renderGroupBlock(sec)}</Fragment>;
              })}
            </div>
          </div>
        </div>
      ) : (
        <CapacityView tasks={tasks} designers={designers} onOpen={setOpenId} />
      )}

      {showCreate ? (
        <CreateBriefModal
          clients={clients}
          designers={designers}
          groups={groups}
          initialGroupId={createGroupId}
          onClose={() => { setShowCreate(false); setCreateGroupId(null); }}
          onCreated={() => {
            setShowCreate(false);
            setCreateGroupId(null);
            load();
          }}
        />
      ) : null}

      {openId ? (
        <StudioTaskDrawer taskId={openId} meId={meId} onClose={() => setOpenId(null)} onChanged={load} />
      ) : null}
    </div>
  );
}

// הוספת משימה מהירה בשורה (כמו במאנדיי): לקוח + כותרת + Enter — בלי לפתוח מודל.
// הלקוח האחרון שנבחר נשמר בדפדפן; "בריף מלא" פותח את הטופס המלא כרגיל.
function QuickAddTask({
  groupId,
  clients,
  onAdded,
  onFullBrief,
}: {
  groupId: string | null;
  clients: Opt[];
  onAdded: () => void;
  onFullBrief: () => void;
}) {
  const [clientId, setClientId] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("studio-quickadd-client") || "" : ""
  );
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!title.trim() || !clientId) return;
    setBusy(true);
    try {
      await api("/api/design-tasks", {
        method: "POST",
        json: { clientId, title: title.trim(), briefType: "post", priority: "normal", groupId },
      });
      setTitle("");
      onAdded();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-[#3a5bd9] focus:outline-none";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Icon name="plus" className="h-3.5 w-3.5 text-slate-400" />
      <select
        value={clientId}
        onChange={(e) => {
          setClientId(e.target.value);
          try { localStorage.setItem("studio-quickadd-client", e.target.value); } catch { /* לא קריטי */ }
        }}
        className={`${inputCls} w-36`}
        title="לקוח"
      >
        <option value="">לקוח…</option>
        {clients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
      </select>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="משימה מהירה — Enter להוספה"
        className={`${inputCls} min-w-48 flex-1`}
        disabled={busy}
      />
      <button
        onClick={add}
        disabled={busy || !title.trim() || !clientId}
        className="rounded-lg bg-[#3a5bd9]/10 px-2.5 py-1 text-[11px] font-medium text-[#3a5bd9] transition hover:bg-[#3a5bd9]/20 disabled:opacity-40"
      >
        הוספה
      </button>
      <button onClick={onFullBrief} className="text-[11px] text-slate-400 transition hover:text-[#3a5bd9]" title="פתיחת טופס הבריף המלא">
        בריף מלא…
      </button>
    </div>
  );
}

function CapacityView({
  tasks,
  designers,
  onOpen,
}: {
  tasks: DTask[];
  designers: Opt[];
  onOpen: (id: string) => void;
}) {
  const active = tasks.filter((t) => t.status !== "approved");
  const cols = [...designers.map((d) => ({ id: d.id, name: d.name })), { id: "", name: "לא משויך" }];
  // תאריך + שעה — הרשימה ממוינת כרונולוגית, והשעה מוצגת כדי שרואים את הרצף.
  const fmt = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("he-IL", {
          timeZone: "Asia/Jerusalem",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(iso))
      : "ללא מועד";
  const dur = (min: number | null) => {
    const m = min ?? 60;
    return m % 60 === 0 ? `${m / 60} ש׳` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} ש׳`;
  };
  return (
    <div className="overflow-x-auto pb-1">
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(230px,1fr))` }}>
      {cols.map((c) => {
        const mine = active
          .filter((t) => (t.designer?.id ?? "") === c.id)
          .sort((a, b) => (a.scheduledAt || "z").localeCompare(b.scheduledAt || "z"));
        return (
          <Card key={c.id || "none"}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700">{c.name}</h3>
              <Chip color={mine.length > 4 ? "#f87171" : "#34d399"}>{mine.length}</Chip>
            </div>
            <div className="flex flex-col gap-1.5">
              {mine.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onOpen(t.id)}
                  className={`rounded-lg border px-2 py-1.5 text-right text-xs transition hover:border-cyan-500/40 ${
                    t.overdue ? "border-rose-700/50 bg-rose-50" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="truncate font-medium text-slate-700">{t.title}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                    <span dir="ltr">{fmt(t.scheduledAt)}</span>
                    {t.scheduledAt ? <span>· {dur(t.durationMin)}</span> : null}·
                    <span
                      className="rounded-full px-1.5 py-px font-medium"
                      style={{ color: DESIGN_STATUS_COLORS[t.status], backgroundColor: `${DESIGN_STATUS_COLORS[t.status]}1a` }}
                    >
                      {DESIGN_STATUS_LABELS[t.status]}
                    </span>
                    {t.overdue ? <span className="text-rose-400">· באיחור</span> : null}
                  </div>
                </button>
              ))}
              {mine.length === 0 ? <p className="text-[11px] text-slate-600">אין משימות פעילות.</p> : null}
            </div>
          </Card>
        );
      })}
    </div>
    </div>
  );
}

function CreateBriefModal({
  clients,
  designers,
  groups,
  initialGroupId,
  onClose,
  onCreated,
}: {
  clients: Opt[];
  designers: Opt[];
  groups: Group[];
  initialGroupId?: string | null;
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
    groupId: initialGroupId || "",
    scheduledAt: "",
    durationMin: "60",
    dueAt: "",
  });
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const [refs, setRefs] = useState<{ fileKey: string; fileName: string; mimeType: string | null }[]>([]);
  const [upBusy, setUpBusy] = useState(false);
  const refInput = useRef<HTMLInputElement>(null);

  async function uploadRefs(files: FileList) {
    if (!form.clientId) {
      setError("בחרו לקוח לפני העלאת רפרנסים");
      return;
    }
    setUpBusy(true);
    setError("");
    try {
      const added: { fileKey: string; fileName: string; mimeType: string | null }[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", "design");
        fd.append("clientId", form.clientId);
        const up = await fetch("/api/uploads/direct", { method: "POST", body: fd });
        const uj = await up.json();
        if (!up.ok) throw new Error(uj.error || "העלאה נכשלה");
        added.push({ fileKey: uj.key, fileName: uj.fileName, mimeType: uj.mimeType });
      }
      setRefs((p) => [...p, ...added]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUpBusy(false);
      if (refInput.current) refInput.current.value = "";
    }
  }

  async function aiBrief() {
    if (!form.brief.trim()) {
      setError("כתבו כמה נקודות ואז לחצו ״נסח עם AI״");
      return;
    }
    setAiBusy(true);
    setError("");
    try {
      const d = await api<{ brief: string }>("/api/studio/ai-brief", {
        method: "POST",
        json: { title: form.title, briefType: form.briefType, notes: form.brief },
      });
      if (d.brief) setForm((f) => ({ ...f, brief: d.brief }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAiBusy(false);
    }
  }

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
          groupId: form.groupId || null,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
          durationMin: Number(form.durationMin) || 60,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
          references: refs.length ? refs : undefined,
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
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
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
          <div className="mb-1 flex justify-end">
            <button
              type="button"
              onClick={aiBrief}
              disabled={aiBusy}
              className="flex items-center gap-1 rounded-lg bg-violet-100 px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-200 disabled:opacity-50"
            >
              <Icon name="edit" className="h-3.5 w-3.5" />
              {aiBusy ? "מנסח…" : "✨ נסח עם AI"}
            </button>
          </div>
          <textarea
            value={form.brief}
            onChange={(e) => setForm({ ...form, brief: e.target.value })}
            rows={5}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            placeholder="כתבו נקודות גולמיות — ואז ״נסח עם AI״ יסדר אותן לבריף מלא. מטרה, מסר, סגנון, טקסטים, צבעים, מה חובה לכלול…"
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

        <Field label="קבוצה בלוח">
          <Select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
            <option value="">— ללא קבוצה —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="רפרנסים / דוגמאות למעצב/ת">
          <input
            ref={refInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files?.length && uploadRefs(e.target.files)}
          />
          <div className="flex flex-col gap-1.5">
            {refs.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700"
              >
                <Icon name="doc" className="h-4 w-4 text-cyan-400" />
                <span className="flex-1 truncate">{r.fileName}</span>
                <button
                  type="button"
                  onClick={() => setRefs((p) => p.filter((_, j) => j !== i))}
                  className="text-slate-600 hover:text-rose-400"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={upBusy || !form.clientId}
            onClick={() => refInput.current?.click()}
            className="mt-1"
          >
            <Icon name="upload" className="h-4 w-4" />
            {upBusy ? "מעלה…" : "העלאת רפרנסים"}
          </Button>
          {!form.clientId ? (
            <p className="mt-1 text-[11px] text-slate-500">בחרו לקוח כדי להעלות רפרנסים.</p>
          ) : null}
        </Field>

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
          <Field label="משך העבודה" hint="קובע את אורך האירוע ביומן המעצב/ת">
            <Select value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })}>
              <option value="30">חצי שעה</option>
              <option value="60">שעה</option>
              <option value="90">שעה וחצי</option>
              <option value="120">שעתיים</option>
              <option value="180">3 שעות</option>
              <option value="240">4 שעות</option>
              <option value="300">5 שעות</option>
              <option value="360">6 שעות</option>
              <option value="480">8 שעות</option>
            </Select>
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
