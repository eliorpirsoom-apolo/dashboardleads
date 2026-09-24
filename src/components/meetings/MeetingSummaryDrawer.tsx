"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { Button, Input, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface Bullet {
  id: string;
  text: string;
  isTask: boolean;
  clientVisible: boolean;
  assigneeId?: string | null;
  dueAt?: string | null;
  taskId?: string | null;
  done?: boolean;
}
interface Meeting {
  id: string;
  clientId: string;
  client: { id: string; name: string } | null;
  projectId: string | null;
  title: string;
  meetingDate: string;
  rawText: string | null;
  bullets: Bullet[];
  status: string;
  source: string;
  createdBy: string | null;
  sentToClientAt: string | null;
  photoUrls: string[];
  hasClientGroup: boolean;
  clientGroupChatId: string;
}
interface Opt { id: string; name: string }

export default function MeetingSummaryDrawer({
  meetingId,
  onClose,
  onChanged,
}: {
  meetingId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [m, setM] = useState<Meeting | null>(null);
  const [projects, setProjects] = useState<Opt[]>([]);
  const [agents, setAgents] = useState<Opt[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const d = await api<{ meeting: Meeting; projects: Opt[]; agents: Opt[] }>(`/api/meetings/${meetingId}`);
    setM(d.meeting);
    setBullets(d.meeting.bullets);
    setProjects(d.projects);
    setAgents(d.agents);
    setDirty(false);
  }, [meetingId]);

  useEffect(() => { load(); }, [load]);

  function patchBullet(id: string, patch: Partial<Bullet>) {
    setBullets((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    setDirty(true);
  }
  function addBullet() {
    setBullets((bs) => [...bs, { id: Math.random().toString(36).slice(2, 10), text: "", isTask: false, clientVisible: true }]);
    setDirty(true);
  }
  function removeBullet(id: string) {
    setBullets((bs) => bs.filter((b) => b.id !== id));
    setDirty(true);
  }

  async function save() {
    if (!m) return;
    setBusy(true); setError(""); setMsg("");
    try {
      await api(`/api/meetings/${m.id}`, {
        method: "PATCH",
        json: { title: m.title, meetingDate: m.meetingDate, projectId: m.projectId, bullets },
      });
      setMsg("נשמר ✓"); setDirty(false); onChanged();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function makeTask(b: Bullet) {
    if (!m) return;
    setBusy(true); setError(""); setMsg("");
    try {
      // שמירה קודם אם יש שינויים לא שמורים, שהבולט קיים בשרת.
      if (dirty) {
        await api(`/api/meetings/${m.id}`, { method: "PATCH", json: { bullets } });
        setDirty(false);
      }
      const d = await api<{ taskId: string }>(`/api/meetings/${m.id}/tasks`, {
        method: "POST",
        json: { bulletId: b.id, assigneeId: b.assigneeId || null, dueAt: b.dueAt || null },
      });
      patchBullet(b.id, { taskId: d.taskId, isTask: true, clientVisible: false });
      setDirty(false);
      await load();
      setMsg("המשימה נוצרה במודול המשימות ✓");
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  const [showSend, setShowSend] = useState(false);
  const [sendGroup, setSendGroup] = useState("");
  async function startSend() {
    if (!m) return;
    setError(""); setMsg("");
    setShowSend(true);
    setSendGroup(m.clientGroupChatId || "");
    if (groups.length === 0) {
      setGroupsLoading(true);
      try {
        const d = await api<{ groups: { id: string; name: string }[] }>("/api/meetings/groups");
        setGroups(d.groups);
      } catch { /* ריק */ } finally { setGroupsLoading(false); }
    }
  }
  async function doSend() {
    if (!m || !sendGroup) return;
    const visible = bullets.filter((b) => b.clientVisible).length;
    if (!confirm(`לשלוח ${visible} נקודות סיכום לקבוצה שנבחרה? (המשימות הפנימיות לא נשלחות)`)) return;
    setBusy(true); setError(""); setMsg("");
    try {
      if (dirty) { await api(`/api/meetings/${m.id}`, { method: "PATCH", json: { bullets } }); setDirty(false); }
      const d = await api<{ sentPoints: number }>(`/api/meetings/${m.id}/send`, {
        method: "POST",
        json: { chatId: sendGroup, remember: true },
      });
      setMsg(`נשלח ללקוח ✓ (${d.sentPoints} נקודות)`);
      setShowSend(false);
      await load(); onChanged();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  async function reprocess() {
    if (!m) return;
    if (dirty && !confirm("יש שינויים לא שמורים בבולטים. פענוח מחדש יחליף אותם בטקסט חדש מהתמונה. להמשיך?")) return;
    setBusy(true); setError(""); setMsg("");
    try {
      const d = await api<{ pointCount: number; taskCount: number }>(`/api/meetings/${m.id}/reprocess`, { method: "POST" });
      await load();
      setMsg(`פוענח מחדש ✓ (${d.pointCount} נקודות, ${d.taskCount} משימות)`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function remove() {
    if (!m || !confirm("למחוק את סיכום הפגישה? המשימות שנגזרו ממנו יישארו.")) return;
    await api(`/api/meetings/${m.id}`, { method: "DELETE" });
    onChanged(); onClose();
  }

  if (!m) {
    return (
      <div className="fixed inset-0 z-50 flex justify-start">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative m-auto text-sm text-white">טוען…</div>
      </div>
    );
  }

  const clientPoints = bullets.filter((b) => b.clientVisible).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-start">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative ms-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-slate-50 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <span className="text-lg">📝</span>
          <input
            value={m.title}
            onChange={(e) => { setM({ ...m, title: e.target.value }); setDirty(true); }}
            className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-sm font-bold text-slate-800 hover:border-slate-200 focus:border-[#3a5bd9] focus:outline-none"
          />
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="סגירה">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}
          {msg ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div> : null}

          {/* מטא */}
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
            <label className="block">
              <span className="mb-1 block text-slate-400">לקוח</span>
              <span className="font-medium text-slate-700">{m.client?.name}</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-400">תאריך פגישה</span>
              <Input type="date" value={m.meetingDate.slice(0, 10)} onChange={(e) => { setM({ ...m, meetingDate: e.target.value }); setDirty(true); }} />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-400">פרויקט</span>
              <Select value={m.projectId ?? ""} onChange={(e) => { setM({ ...m, projectId: e.target.value || null }); setDirty(true); }}>
                <option value="">—</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </label>
          </div>

          {/* תמונות מקור + פענוח מחדש */}
          {m.photoUrls.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {m.photoUrls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="block">
                  <img src={u} alt={`דף פגישה ${i + 1}`} className="h-24 rounded-lg border border-slate-200 object-cover" />
                </a>
              ))}
              <button
                onClick={reprocess}
                disabled={busy}
                title="פענוח מחדש של התמונה (gpt-4o) — מחליף את הנקודות"
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:border-[#3a5bd9] hover:text-[#3a5bd9] disabled:opacity-50"
              >
                <Icon name="edit" className="h-3.5 w-3.5" /> {busy ? "מפענח…" : "פענח מחדש מהתמונה"}
              </button>
            </div>
          ) : null}

          {/* בולטים */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-sm font-bold text-slate-600">נקודות הפגישה</span>
              <span className="text-[11px] text-slate-400">{clientPoints} נשלחות ללקוח · {bullets.filter((b) => b.isTask).length} משימות</span>
            </div>
            <div className="divide-y divide-slate-100">
              {bullets.map((b) => (
                <div key={b.id} className="flex flex-col gap-2 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <span className="pt-2 text-slate-300">•</span>
                    <textarea
                      value={b.text}
                      onChange={(e) => patchBullet(b.id, { text: e.target.value })}
                      rows={1}
                      className="min-h-[34px] flex-1 resize-y rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:border-[#3a5bd9] focus:outline-none"
                    />
                    <button onClick={() => removeBullet(b.id)} title="מחיקת שורה" className="pt-1.5 text-slate-300 hover:text-rose-400">
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pr-5 text-[11px]">
                    <label className={`flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 ${b.isTask ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500"}`}>
                      <input type="checkbox" checked={b.isTask} onChange={(e) => patchBullet(b.id, { isTask: e.target.checked, clientVisible: e.target.checked ? false : b.clientVisible })} className="h-3 w-3" />
                      משימה לביצוע
                    </label>
                    <label className={`flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 ${b.clientVisible ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-400"}`}>
                      <input type="checkbox" checked={b.clientVisible} onChange={(e) => patchBullet(b.id, { clientVisible: e.target.checked })} className="h-3 w-3" />
                      נשלח ללקוח
                    </label>
                    {b.isTask && !b.taskId ? (
                      <>
                        <Select value={b.assigneeId ?? ""} onChange={(e) => patchBullet(b.id, { assigneeId: e.target.value || null })} className="!py-0.5 !text-[11px]">
                          <option value="">אחראי…</option>
                          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </Select>
                        <input type="date" value={b.dueAt ? b.dueAt.slice(0, 10) : ""} onChange={(e) => patchBullet(b.id, { dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })} className="rounded-lg border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600" />
                        <button onClick={() => makeTask(b)} disabled={busy} className="rounded-lg bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-200 disabled:opacity-50">
                          ⬇ הורד לביצוע
                        </button>
                      </>
                    ) : null}
                    {b.taskId ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">✓ משימה נוצרה</span> : null}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addBullet} className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-2 text-xs text-slate-400 hover:text-[#3a5bd9]">
              <Icon name="plus" className="h-3.5 w-3.5" /> הוספת שורה
            </button>
          </div>
        </div>

        {/* בחירת קבוצה ושליחה */}
        {showSend ? (
          <div className="border-t border-slate-200 bg-sky-50 px-4 py-3 text-xs text-slate-700">
            <div className="mb-1 font-medium">בחרו את קבוצת הוואטסאפ של הלקוח לשליחת הסיכום:</div>
            <div className="flex flex-wrap items-center gap-2">
              {groupsLoading ? (
                <span className="text-slate-500">טוען קבוצות…</span>
              ) : groups.length > 0 ? (
                <Select value={sendGroup} onChange={(e) => setSendGroup(e.target.value)} className="grow">
                  <option value="">— בחרו קבוצה —</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
              ) : (
                <span className="text-amber-600">לא נמצאו קבוצות שהבוט חבר בהן. הוסיפו את מספר הבוט לקבוצת הלקוח ורעננו.</span>
              )}
              <Button size="sm" onClick={doSend} disabled={busy || !sendGroup}>אישור ושליחה</Button>
              <button onClick={() => setShowSend(false)} className="text-slate-500">ביטול</button>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              מוצגות רק קבוצות שהבוט (״יעקב״) חבר בהן. הבחירה נשמרת כברירת המחדל של הלקוח לפעם הבאה.
            </div>
          </div>
        ) : null}

        {/* פעולות */}
        <div className="sticky bottom-0 mt-auto flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 py-3">
          <Button onClick={save} disabled={busy || !dirty}>{busy ? "שומר…" : dirty ? "שמירה" : "נשמר"}</Button>
          <Button variant="ghost" onClick={startSend} disabled={busy} title="בחירת קבוצה ושליחת הסיכום ללקוח">
            <Icon name="megaphone" className="h-4 w-4" /> שלח ללקוח
          </Button>
          {m.sentToClientAt ? <span className="text-[11px] text-emerald-600">נשלח ללקוח</span> : null}
          <button onClick={remove} className="mr-auto rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 hover:border-red-400">
            מחיקת סיכום
          </button>
        </div>
      </aside>
    </div>
  );
}
