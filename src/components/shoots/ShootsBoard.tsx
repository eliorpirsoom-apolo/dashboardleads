"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Chip, Field, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";
import {
  SHOOT_STATUSES,
  SHOOT_TYPES,
  shootStatusMeta,
  shootTypeLabel,
} from "@/lib/shoots";

interface Ref {
  id: string;
  name: string;
}
interface CrewMember {
  userId: string;
  name: string;
  role: string | null;
}
interface Shoot {
  id: string;
  clientId: string;
  client: Ref | null;
  projectId: string | null;
  project: Ref | null;
  title: string | null;
  date: string;
  endAt: string | null;
  location: string | null;
  types: string[];
  status: string;
  equipment: string | null;
  deliverables: string | null;
  cost: number | null;
  notes: string | null;
  crew: CrewMember[];
  assetCount: number;
}

interface ShootAsset {
  id: string;
  fileKey: string | null;
  url: string | null;
  fileName: string;
  mimeType: string | null;
  size: number | null;
  note: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

type Draft = {
  clientId: string;
  projectId: string;
  title: string;
  date: string;
  endAt: string;
  location: string;
  types: string[];
  status: string;
  equipment: string;
  deliverables: string;
  cost: string;
  notes: string;
  crew: string[]; // userIds
};

const emptyDraft = (): Draft => ({
  clientId: "",
  projectId: "",
  title: "",
  date: "",
  endAt: "",
  location: "",
  types: [],
  status: "pending",
  equipment: "",
  deliverables: "",
  cost: "",
  notes: "",
  crew: [],
});

// ISO → "YYYY-MM-DDTHH:mm" לשדה datetime-local (זמן מקומי של הדפדפן = ישראל).
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function ShootsBoard({
  clients,
  team,
  isManager,
}: {
  clients: Ref[];
  team: Ref[];
  isManager: boolean;
}) {
  const [shoots, setShoots] = useState<Shoot[]>([]);
  const [view, setView] = useState<"board" | "calendar" | "availability">("board");
  const [filterClient, setFilterClient] = useState("");
  const [editing, setEditing] = useState<Shoot | "new" | null>(null);
  const [deliverablesFor, setDeliverablesFor] = useState<Shoot | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const q = filterClient ? `?clientId=${filterClient}` : "";
      const d = await api<{ shoots: Shoot[] }>(`/api/shoots${q}`);
      setShoots(d.shoots);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, [filterClient]);
  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(s: Shoot, status: string) {
    setShoots((prev) => prev.map((x) => (x.id === s.id ? { ...x, status } : x)));
    try {
      await api(`/api/shoots/${s.id}`, { method: "PATCH", json: { status } });
    } catch (e: any) {
      setError(e.message);
      load();
    }
  }

  async function remove(s: Shoot) {
    if (!confirm(`למחוק את יום הצילום${s.title ? ` "${s.title}"` : ""}? פעולה בלתי הפיכה.`)) return;
    try {
      await api(`/api/shoots/${s.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-slate-200 bg-white p-0.5">
          <button
            onClick={() => setView("board")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === "board" ? "bg-[#3a5bd9] text-white" : "text-slate-600"}`}
          >
            לוח
          </button>
          <button
            onClick={() => setView("calendar")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === "calendar" ? "bg-[#3a5bd9] text-white" : "text-slate-600"}`}
          >
            לוח שנה
          </button>
          <button
            onClick={() => setView("availability")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === "availability" ? "bg-[#3a5bd9] text-white" : "text-slate-600"}`}
          >
            זמינות צוות
          </button>
        </div>
        <Select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className="!w-48">
          <option value="">כל הלקוחות</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <div className="mr-auto">
          <Button onClick={() => setEditing("new")}>
            <Icon name="plus" className="h-4 w-4" />
            יום צילום חדש
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {editing ? (
        <ShootForm
          initial={editing === "new" ? null : editing}
          clients={clients}
          team={team}
          isManager={isManager}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}

      {view === "board" ? (
        <BoardView
          shoots={shoots}
          isManager={isManager}
          onStatus={changeStatus}
          onEdit={(s) => setEditing(s)}
          onDelete={remove}
          onDeliverables={(s) => setDeliverablesFor(s)}
        />
      ) : view === "calendar" ? (
        <CalendarView shoots={shoots} onEdit={(s) => setEditing(s)} />
      ) : (
        <AvailabilityView shoots={shoots} />
      )}

      {deliverablesFor ? (
        <DeliverablesModal
          shoot={deliverablesFor}
          onClose={() => setDeliverablesFor(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}

// --- רשימה מחולקת לפי חודשים (שורה אחת לכל יום צילום, עם שינוי סטטוס) --------
function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
}
function monthLabel(d: Date) {
  return d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

function BoardView({
  shoots,
  isManager,
  onStatus,
  onEdit,
  onDelete,
  onDeliverables,
}: {
  shoots: Shoot[];
  isManager: boolean;
  onStatus: (s: Shoot, status: string) => void;
  onEdit: (s: Shoot) => void;
  onDelete: (s: Shoot) => void;
  onDeliverables: (s: Shoot) => void;
}) {
  // ה-API מחזיר חדש-למעלה (date desc) → החודשים מופיעים מהחדש לישן בסדר השמור.
  const map = new Map<string, Shoot[]>();
  for (const s of shoots) {
    const d = new Date(s.date);
    const k = isNaN(d.getTime()) ? "unknown" : monthKey(d);
    const arr = map.get(k);
    if (arr) arr.push(s);
    else map.set(k, [s]);
  }
  const groups = [...map.entries()].map(([key, items]) => {
    const d = new Date(items[0].date);
    return { key, label: isNaN(d.getTime()) ? "ללא תאריך" : monthLabel(d), items };
  });

  if (shoots.length === 0) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-slate-500">אין ימי צילום עדיין — לחצו &quot;יום צילום חדש&quot;.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-700">{g.label}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{g.items.length}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {g.items.map((s) => (
              <ShootRow key={s.id} s={s} isManager={isManager} onStatus={onStatus} onEdit={onEdit} onDelete={onDelete} onDeliverables={onDeliverables} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// שורה אחת ליום צילום — כמו שורת משימה: פרטים בשורה + בורר סטטוס + עריכה/מחיקה.
function ShootRow({
  s,
  isManager,
  onStatus,
  onEdit,
  onDelete,
  onDeliverables,
}: {
  s: Shoot;
  isManager: boolean;
  onStatus: (s: Shoot, status: string) => void;
  onEdit: (s: Shoot) => void;
  onDelete: (s: Shoot) => void;
  onDeliverables: (s: Shoot) => void;
}) {
  const meta = shootStatusMeta(s.status);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: meta.color }} title={meta.label} />
      <span className="text-sm font-medium text-slate-800">{s.title || s.client?.name || "יום צילום"}</span>
      <span className="text-xs text-slate-500">📅 {formatDateTime(s.date)}</span>
      {s.client ? (
        <span className="text-xs text-slate-500">🏢 {s.client.name}{s.project ? ` · ${s.project.name}` : ""}</span>
      ) : null}
      {s.location ? <span className="text-xs text-slate-500">📍 {s.location}</span> : null}
      {s.types.length > 0 ? <span className="text-xs text-slate-400">{s.types.map(shootTypeLabel).join(", ")}</span> : null}
      {s.crew.length > 0 ? <span className="text-xs text-slate-400">👥 {s.crew.map((c) => c.name).join(", ")}</span> : null}
      {isManager && s.cost != null ? (
        <span className="text-xs font-medium text-emerald-700">💰 ₪{s.cost.toLocaleString()}</span>
      ) : null}
      <div className="mr-auto flex items-center gap-1">
        <button
          onClick={() => onDeliverables(s)}
          className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition ${s.assetCount > 0 ? "border-[#3a5bd9]/40 bg-[#3a5bd9]/10 text-[#3a5bd9]" : "border-slate-200 text-slate-500 hover:border-[#3a5bd9] hover:text-[#3a5bd9]"}`}
          title="תוצרים סופיים"
        >
          📦 תוצרים{s.assetCount > 0 ? ` · ${s.assetCount}` : ""}
        </button>
        <Select value={s.status} onChange={(e) => onStatus(s, e.target.value)} className="!w-28 !py-1 text-xs">
          {SHOOT_STATUSES.map((st) => (
            <option key={st.key} value={st.key}>{st.label}</option>
          ))}
        </Select>
        <button onClick={() => onEdit(s)} className="rounded p-1.5 text-slate-400 hover:text-[#3a5bd9]" title="עריכה">
          <Icon name="edit" className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDelete(s)} className="rounded p-1.5 text-slate-400 hover:text-red-600" title="מחיקה">
          <Icon name="trash" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// --- לוח שנה חודשי -----------------------------------------------------------
function CalendarView({ shoots, onEdit }: { shoots: Shoot[]; onEdit: (s: Shoot) => void }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const byDay = useMemo(() => {
    const m = new Map<string, Shoot[]>();
    for (const s of shoots) {
      const d = new Date(s.date);
      if (isNaN(d.getTime())) continue;
      const k = dayKey(d);
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    return m;
  }, [shoots]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0=ראשון
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthName = cursor.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
  const todayKey = dayKey(new Date());
  const WD = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(year, month - 1, 1))}>← הקודם</Button>
        <span className="text-sm font-bold text-slate-700">{monthName}</span>
        <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(year, month + 1, 1))}>הבא →</Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400">
        {WD.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} className="min-h-[72px] rounded-lg bg-slate-50/50" />;
          const k = `${year}-${month}-${d}`;
          const list = byDay.get(k) ?? [];
          const isToday = k === todayKey;
          return (
            <div key={k} className={`min-h-[72px] rounded-lg border p-1 ${isToday ? "border-[#3a5bd9] bg-[#3a5bd9]/5" : "border-slate-100"}`}>
              <div className="text-[11px] font-medium text-slate-500">{d}</div>
              <div className="mt-0.5 flex flex-col gap-0.5">
                {list.map((s) => {
                  const meta = shootStatusMeta(s.status);
                  return (
                    <button
                      key={s.id}
                      onClick={() => onEdit(s)}
                      className="truncate rounded px-1 py-0.5 text-right text-[10px] text-white"
                      style={{ background: meta.color }}
                      title={`${s.title || s.client?.name || "יום צילום"} · ${formatDateTime(s.date)}`}
                    >
                      {s.title || s.client?.name || "צילום"}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// --- זמינות צוות (עומס + אזהרת חפיפה) ----------------------------------------
function AvailabilityView({ shoots }: { shoots: Shoot[] }) {
  const now = Date.now();
  const byUser = new Map<
    string,
    { name: string; items: { s: Shoot; start: number; end: number; conflict: boolean }[] }
  >();
  for (const s of shoots) {
    const start = new Date(s.date).getTime();
    if (isNaN(start) || start < now - 2 * 3600 * 1000) continue; // עתידיים בלבד
    const end = s.endAt ? new Date(s.endAt).getTime() : start + 2 * 3600 * 1000;
    for (const c of s.crew) {
      const u = byUser.get(c.userId) ?? { name: c.name, items: [] };
      u.items.push({ s, start, end, conflict: false });
      byUser.set(c.userId, u);
    }
  }
  for (const u of byUser.values()) {
    u.items.sort((a, b) => a.start - b.start);
    for (let i = 0; i < u.items.length - 1; i++) {
      if (u.items[i].end > u.items[i + 1].start) {
        u.items[i].conflict = true;
        u.items[i + 1].conflict = true;
      }
    }
  }
  const rows = [...byUser.entries()].filter(([, u]) => u.items.length > 0);

  return (
    <Card>
      <p className="mb-3 text-xs text-slate-500">
        שיבוצי הצוות הקרובים. ⚠️ = חפיפה בין שני ימי צילום לאותו אדם. (לתמונה מלאה בחרו
        &quot;כל הלקוחות&quot; בסינון למעלה.)
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">אין שיבוצי צוות עתידיים.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map(([uid, u]) => (
            <div key={uid} className="rounded-xl border border-slate-200 p-3">
              <p className="mb-2 text-sm font-bold text-slate-700">
                👤 {u.name}
                <span className="text-xs font-normal text-slate-400"> · {u.items.length} ימי צילום</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {u.items.map((it, idx) => {
                  const meta = shootStatusMeta(it.s.status);
                  return (
                    <span
                      key={idx}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${it.conflict ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}
                      title={it.s.client?.name ?? ""}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                      {it.conflict ? "⚠️ " : ""}
                      {formatDateTime(it.s.date)} · {it.s.title || it.s.client?.name || "צילום"}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// --- טופס הוספה / עריכה ------------------------------------------------------
function ShootForm({
  initial,
  clients,
  team,
  isManager,
  onCancel,
  onSaved,
}: {
  initial: Shoot | null;
  clients: Ref[];
  team: Ref[];
  isManager: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<Draft>(() =>
    initial
      ? {
          clientId: initial.clientId,
          projectId: initial.projectId ?? "",
          title: initial.title ?? "",
          date: toLocalInput(initial.date),
          endAt: toLocalInput(initial.endAt),
          location: initial.location ?? "",
          types: initial.types ?? [],
          status: initial.status,
          equipment: initial.equipment ?? "",
          deliverables: initial.deliverables ?? "",
          cost: initial.cost != null ? String(initial.cost) : "",
          notes: initial.notes ?? "",
          crew: initial.crew.map((c) => c.userId),
        }
      : emptyDraft()
  );
  const [projects, setProjects] = useState<Ref[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  // טעינת פרויקטים של הלקוח הנבחר.
  useEffect(() => {
    if (!d.clientId) {
      setProjects([]);
      return;
    }
    api<{ projects: { id: string; name: string; status: string }[] }>(`/api/projects?clientId=${d.clientId}`)
      .then((r) => setProjects(r.projects.filter((p) => p.status === "active")))
      .catch(() => setProjects([]));
  }, [d.clientId]);

  const toggleType = (t: string) =>
    set("types", d.types.includes(t) ? d.types.filter((x) => x !== t) : [...d.types, t]);
  const toggleCrew = (id: string) =>
    set("crew", d.crew.includes(id) ? d.crew.filter((x) => x !== id) : [...d.crew, id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d.clientId) return setErr("יש לבחור לקוח");
    if (!d.date) return setErr("יש לבחור תאריך ושעה");
    setBusy(true);
    setErr("");
    const payload: Record<string, unknown> = {
      clientId: d.clientId,
      projectId: d.projectId || null,
      title: d.title.trim() || null,
      date: new Date(d.date).toISOString(),
      endAt: d.endAt ? new Date(d.endAt).toISOString() : null,
      location: d.location.trim() || null,
      types: d.types,
      status: d.status,
      equipment: d.equipment.trim() || null,
      deliverables: d.deliverables.trim() || null,
      notes: d.notes.trim() || null,
      crew: d.crew.map((userId) => ({ userId })),
    };
    if (isManager) payload.cost = d.cost.trim() ? Number(d.cost) : null;
    try {
      if (initial) await api(`/api/shoots/${initial.id}`, { method: "PATCH", json: payload });
      else await api("/api/shoots", { method: "POST", json: payload });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <h3 className="text-base font-bold text-slate-800">{initial ? "עריכת יום צילום" : "יום צילום חדש"}</h3>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[180px] flex-1">
            <Field label="לקוח">
              <Select value={d.clientId} onChange={(e) => { set("clientId", e.target.value); set("projectId", ""); }} required>
                <option value="">— בחר לקוח —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="min-w-[160px] flex-1">
            <Field label="פרויקט (אופציונלי)">
              <Select value={d.projectId} onChange={(e) => set("projectId", e.target.value)} disabled={!d.clientId}>
                <option value="">— ללא —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        <Field label="כותרת (אופציונלי)">
          <Input value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="למשל: צילומי חוץ — פרויקט X" />
        </Field>

        <div className="flex flex-wrap gap-3">
          <div className="flex-1">
            <Field label="תאריך ושעה">
              <Input type="datetime-local" value={d.date} onChange={(e) => set("date", e.target.value)} required />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="שעת סיום (אופציונלי)">
              <Input type="datetime-local" value={d.endAt} onChange={(e) => set("endAt", e.target.value)} />
            </Field>
          </div>
        </div>

        <Field label="מיקום">
          <Input value={d.location} onChange={(e) => set("location", e.target.value)} placeholder="כתובת / אתר הצילום" />
        </Field>

        <div>
          <p className="mb-1 text-sm font-medium text-slate-600">סוג צילום</p>
          <div className="flex flex-wrap gap-2">
            {SHOOT_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => toggleType(t.key)}
                className={`rounded-lg border px-3 py-1 text-xs transition ${d.types.includes(t.key) ? "border-[#3a5bd9] bg-[#3a5bd9]/10 text-[#3a5bd9]" : "border-slate-300 text-slate-600"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-slate-600">צוות</p>
          <div className="flex flex-wrap gap-2">
            {team.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleCrew(u.id)}
                className={`rounded-lg border px-3 py-1 text-xs transition ${d.crew.includes(u.id) ? "border-[#3a5bd9] bg-[#3a5bd9]/10 text-[#3a5bd9]" : "border-slate-300 text-slate-600"}`}
              >
                {u.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="min-w-[160px] flex-1">
            <Field label="סטטוס">
              <Select value={d.status} onChange={(e) => set("status", e.target.value)}>
                {SHOOT_STATUSES.map((st) => (
                  <option key={st.key} value={st.key}>{st.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          {isManager ? (
            <div className="w-40">
              <Field label="עלות (₪, מנהלים)">
                <Input type="number" min="0" value={d.cost} onChange={(e) => set("cost", e.target.value)} placeholder="—" />
              </Field>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="min-w-[180px] flex-1">
            <Field label="ציוד">
              <Textarea rows={2} value={d.equipment} onChange={(e) => set("equipment", e.target.value)} placeholder="מצלמות, עדשות, תאורה…" />
            </Field>
          </div>
          <div className="min-w-[180px] flex-1">
            <Field label="תוצרים נדרשים">
              <Textarea rows={2} value={d.deliverables} onChange={(e) => set("deliverables", e.target.value)} placeholder="כמה תמונות / סרטונים, פורמטים…" />
            </Field>
          </div>
        </div>

        <Field label="הערות">
          <Textarea rows={2} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>

        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={busy}>{busy ? "שומר…" : "שמירה"}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>ביטול</Button>
        </div>
      </form>
    </Card>
  );
}

// --- תוצרים סופיים (קבצים + קישורים) ----------------------------------------
function formatBytes(n: number | null): string {
  if (!n || n <= 0) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

function DeliverablesModal({
  shoot,
  onClose,
  onChanged,
}: {
  shoot: Shoot;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [assets, setAssets] = useState<ShootAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");

  const reload = useCallback(async () => {
    try {
      const d = await api<{ assets: ShootAsset[] }>(`/api/shoots/${shoot.id}/assets`);
      setAssets(d.assets);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [shoot.id]);
  useEffect(() => {
    reload();
  }, [reload]);

  async function register(body: Record<string, unknown>) {
    await api(`/api/shoots/${shoot.id}/assets`, { method: "POST", json: body });
    await reload();
    onChanged();
  }

  async function uploadFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      let key: string;
      let name = file.name;
      const mimeType = file.type || "application/octet-stream";
      if (file.size > 3_500_000) {
        // ישירות ל-R2 (עד 100MB) — עוקף את תקרת 4.5MB של Vercel.
        const pres = await api<{ target: { url: string; headers: Record<string, string> }; key: string }>(
          "/api/uploads/presign",
          { method: "POST", json: { clientId: shoot.clientId, category: "shoot", fileName: file.name, mimeType, size: file.size } }
        );
        const put = await fetch(pres.target.url, { method: "PUT", headers: pres.target.headers, body: file });
        if (!put.ok) throw new Error("העלאה נכשלה");
        key = pres.key;
      } else {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", "shoot");
        fd.append("clientId", shoot.clientId);
        const up = await fetch("/api/uploads/direct", { method: "POST", body: fd });
        const uj = await up.json();
        if (!up.ok) throw new Error(uj.error || "העלאה נכשלה");
        key = uj.key;
        name = uj.fileName || name;
      }
      await register({ fileKey: key, fileName: name, mimeType, size: file.size });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    const url = linkUrl.trim();
    if (!url) return;
    setBusy(true);
    setError("");
    try {
      await register({ url, fileName: linkName.trim() || url });
      setLinkUrl("");
      setLinkName("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: ShootAsset) {
    if (!confirm(`להסיר את "${a.fileName}"? פעולה בלתי הפיכה.`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/shoot-assets/${a.id}`, { method: "DELETE" });
      await reload();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const title = `📦 תוצרים סופיים — ${shoot.title || shoot.client?.name || "יום צילום"}`;

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="py-4 text-center text-sm text-slate-500">טוען…</p>
        ) : assets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
            אין תוצרים עדיין — העלו קבצים או הוסיפו קישור 👇
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {assets.map((a) => {
              const isImage = (a.mimeType || "").startsWith("image/");
              const href = `/api/shoot-assets/${a.id}`;
              return (
                <div key={a.id} className="group relative flex gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-xl"
                    title={a.fileName}
                  >
                    {a.url ? (
                      "🔗"
                    ) : isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={href} alt={a.fileName} className="h-full w-full object-cover" />
                    ) : (a.mimeType || "").startsWith("video/") ? (
                      "🎬"
                    ) : (
                      "📄"
                    )}
                  </a>
                  <div className="min-w-0 flex-1">
                    <a href={href} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium text-slate-800 hover:text-[#3a5bd9]" title={a.fileName}>
                      {a.fileName}
                    </a>
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {a.url ? "קישור חיצוני" : formatBytes(a.size)}
                      {a.uploadedBy ? ` · ${a.uploadedBy}` : ""}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#3a5bd9] hover:underline">
                        {a.url ? "פתיחה" : "צפייה"}
                      </a>
                      {!a.url ? (
                        <a href={`${href}?download=1`} className="text-slate-500 hover:underline">הורדה</a>
                      ) : null}
                      <button onClick={() => remove(a)} disabled={busy} className="mr-auto text-rose-500 hover:underline">
                        הסרה
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600 transition hover:border-[#3a5bd9] hover:text-[#3a5bd9]">
          <input type="file" className="hidden" disabled={busy} onChange={(e) => { uploadFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          {busy ? "מעלה…" : "📎 העלאת קובץ (תמונה / וידאו / PDF — עד 100MB)"}
        </label>

        <form onSubmit={addLink} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-medium text-slate-500">או הוספת קישור חיצוני (Drive / WeTransfer — מומלץ לווידאו כבד)</p>
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-[220px] flex-1" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://drive.google.com/…" />
            <Input className="w-40" value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="שם (אופציונלי)" />
            <Button type="submit" variant="ghost" disabled={busy || !linkUrl.trim()}>הוספה</Button>
          </div>
        </form>

        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>סגירה</Button>
        </div>
      </div>
    </Modal>
  );
}
