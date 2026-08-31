"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { Button, Card } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

// ---------------------------------------------------------------------------
// לוח קידום אורגני: בלוק לכל לקוח, שורות פעולות, פילטר חודשי, מכסה חודשית
// עם פסי התקדמות. עלויות מוצגות למנהלים בלבד (השרת לא מחזיר אותן לעובדים).
// ---------------------------------------------------------------------------

const KINDS: { key: string; label: string; icon: string; color: string; quotaKey?: QuotaKey }[] = [
  { key: "link", label: "רכישת לינק", icon: "🔗", color: "#3a5bd9", quotaKey: "links" },
  { key: "content", label: "כתיבת תוכן", icon: "✍️", color: "#8b5cf6", quotaKey: "content" },
  { key: "onsite", label: "אופטימיזציה", icon: "⚙️", color: "#0891b2", quotaKey: "onsite" },
  { key: "update", label: "עדכון באתר", icon: "🛠️", color: "#d97706", quotaKey: "updates" },
  { key: "other", label: "אחר", icon: "📌", color: "#64748b" },
];
const kindOf = (k: string) => KINDS.find((x) => x.key === k) ?? KINDS[4];

const STATUSES: { key: string; label: string; color: string }[] = [
  { key: "planned", label: "מתוכנן", color: "#94a3b8" },
  { key: "in_progress", label: "בביצוע", color: "#f59e0b" },
  { key: "done", label: "בוצע ✓", color: "#10b981" },
];
const statusOf = (s: string) => STATUSES.find((x) => x.key === s) ?? STATUSES[0];

type QuotaKey = "links" | "content" | "onsite" | "updates";

interface Quota { links: number; content: number; onsite: number; updates: number; notes: string | null }
interface Action {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  targetPage: string | null;
  anchor: string | null;
  status: string;
  notes: string | null;
  images: string | null; // JSON [{key,name}]
  assignee: { id: string; name: string } | null;
  cost: number | null;
}

function imageList(a: Action): { key: string; name: string }[] {
  try {
    const arr = a.images ? JSON.parse(a.images) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
interface Block {
  client: { id: string; name: string; color: string | null };
  quota: Quota | null;
  actions: Action[];
  totalCost: number | null;
}

const ILS = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

function nowYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const ymLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_HE[m - 1]} ${y}`;
};

export default function OrganicBoard({
  users,
  isManager,
}: {
  users: { id: string; name: string }[];
  isManager: boolean;
}) {
  const [month, setMonth] = useState(nowYm());
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [addable, setAddable] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [quotaEdit, setQuotaEdit] = useState<string | null>(null); // clientId שבעריכת מכסה
  // שורות נעולות כברירת מחדל — עריכה רק אחרי לחיצה על ✏️ (בקשת הבעלים).
  const [editId, setEditId] = useState<string | null>(null);
  const [imagesFor, setImagesFor] = useState<{ action: Action; clientId: string } | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await api<{ blocks: Block[]; addable: { id: string; name: string }[] }>(`/api/organic?month=${month}`);
      setBlocks(d.blocks);
      setAddable(d.addable);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => {
    load();
  }, [load]);

  async function addClient(clientId: string) {
    if (!clientId) return;
    await api("/api/organic/quota", { method: "POST", json: { clientId } }).catch((e) => setError(e.message));
    load();
  }
  async function removeClient(b: Block) {
    if (!confirm(`להסיר את ״${b.client.name}״ מלוח הקידום? ההיסטוריה נשמרת — רק הבלוק יוסר.`)) return;
    await api(`/api/organic/quota?clientId=${b.client.id}`, { method: "DELETE" }).catch(() => {});
    load();
  }
  async function patch(id: string, data: Record<string, unknown>) {
    try {
      await api(`/api/organic/${id}`, { method: "PATCH", json: data });
    } catch (e: any) {
      setError(e.message);
    }
    load();
  }
  async function del(id: string) {
    if (!confirm("למחוק את הפעולה?")) return;
    await api(`/api/organic/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-[#3a5bd9] focus:outline-none";

  // פס התקדמות מול מכסה: בוצע מתוך מובטח לסוג.
  const quotaBar = (b: Block, qk: QuotaKey, kindKey: string) => {
    const target = b.quota?.[qk] ?? 0;
    if (!target) return null;
    const done = b.actions.filter((a) => a.kind === kindKey && a.status === "done").length;
    const k = KINDS.find((x) => x.quotaKey === qk)!;
    const pct = Math.min(100, Math.round((done / target) * 100));
    return (
      <div key={qk} className="flex items-center gap-1.5" title={`${k.label}: בוצעו ${done} מתוך ${target}`}>
        <span className="text-xs">{k.icon}</span>
        <div className="h-1.5 w-14 rounded-full bg-slate-200">
          <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: done >= target ? "#10b981" : k.color }} />
        </div>
        <span className={`text-[11px] font-medium ${done >= target ? "text-emerald-600" : "text-slate-500"}`}>
          {done}/{target}
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* בקרת חודש + הוספת לקוח */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <button onClick={() => setMonth((m) => shiftYm(m, -1))} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">‹</button>
          <span className="min-w-28 text-center text-sm font-bold text-slate-800">{ymLabel(month)}</span>
          <button onClick={() => setMonth((m) => shiftYm(m, 1))} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">›</button>
        </div>
        {month !== nowYm() ? (
          <Button size="sm" variant="ghost" onClick={() => setMonth(nowYm())}>החודש</Button>
        ) : null}
        <div className="mr-auto">
          <select className={`${inputCls} !w-56 !py-2 !text-sm`} value="" onChange={(e) => addClient(e.target.value)}>
            <option value="">+ הוספת לקוח ללוח…</option>
            {addable.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <Card><p className="p-6 text-center text-sm text-slate-500">טוען…</p></Card>
      ) : blocks.length === 0 ? (
        <Card>
          <p className="py-10 text-center text-sm text-slate-500">
            אין עדיין לקוחות בלוח הקידום. הוסיפו לקוח מהרשימה למעלה — ואז הגדירו לו מכסה חודשית והתחילו לתעד פעולות.
          </p>
        </Card>
      ) : (
        blocks.map((b) => (
          <Card key={b.client.id} className="!p-0 overflow-hidden">
            {/* כותרת בלוק לקוח */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ boxShadow: `inset 4px 0 0 ${b.client.color ?? "#3a5bd9"}` }}>
              <button onClick={() => setCollapsed((p) => ({ ...p, [b.client.id]: !p[b.client.id] }))} className="text-slate-400 hover:text-slate-900">
                {collapsed[b.client.id] ? "▸" : "▾"}
              </button>
              <span className="font-bold text-slate-800">{b.client.name}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{b.actions.length} פעולות</span>
              <div className="flex flex-wrap items-center gap-3">
                {(["links", "content", "onsite", "updates"] as QuotaKey[]).map((qk) =>
                  quotaBar(b, qk, KINDS.find((k) => k.quotaKey === qk)!.key)
                )}
                {!b.quota || (!b.quota.links && !b.quota.content && !b.quota.onsite && !b.quota.updates) ? (
                  <span className="text-[11px] text-slate-400">אין מכסה מוגדרת</span>
                ) : null}
              </div>
              <span className="mr-auto flex items-center gap-3">
                {isManager && b.totalCost ? (
                  <span className="text-xs font-medium text-slate-600" title="סך עלויות החודש (לינקים)">{ILS(b.totalCost)}</span>
                ) : null}
                <button
                  onClick={() => setQuotaEdit(quotaEdit === b.client.id ? null : b.client.id)}
                  className="text-[11px] text-slate-500 hover:text-[#3a5bd9]"
                  title="הגדרת המכסה החודשית של הלקוח"
                >
                  ⚙ מכסה
                </button>
                <button onClick={() => removeClient(b)} title="הסרה מהלוח" className="text-slate-400 hover:text-rose-500">
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>

            {quotaEdit === b.client.id ? (
              <QuotaEditor
                clientId={b.client.id}
                quota={b.quota}
                onSaved={() => { setQuotaEdit(null); load(); }}
                onCancel={() => setQuotaEdit(null)}
              />
            ) : null}

            {!collapsed[b.client.id] ? (
              <div className="border-t border-slate-200">
                <QuickAdd clientId={b.client.id} month={month} users={users} isManager={isManager} onAdded={load} />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] table-fixed text-right text-sm">
                    <colgroup>
                      <col style={{ width: 128 }} />
                      <col />
                      <col style={{ width: 170 }} />
                      <col style={{ width: 150 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ width: 118 }} />
                      {isManager ? <col style={{ width: 84 }} /> : null}
                      <col style={{ width: 88 }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                        <th className="px-2 py-2 text-right font-medium">סוג</th>
                        <th className="px-2 py-2 text-right font-medium">תיאור</th>
                        <th className="px-2 py-2 text-right font-medium">קישור</th>
                        <th className="px-2 py-2 text-right font-medium">עמוד יעד</th>
                        <th className="px-2 py-2 text-right font-medium">אנקור</th>
                        <th className="px-2 py-2 text-right font-medium">סטטוס</th>
                        <th className="px-2 py-2 text-right font-medium">מבצע/ת</th>
                        {isManager ? <th className="px-2 py-2 text-right font-medium">עלות</th> : null}
                        <th className="px-1 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.actions.map((a) => {
                        const k = kindOf(a.kind);
                        const st = statusOf(a.status);
                        const editing = editId === a.id;
                        const imgs = imageList(a);
                        return (
                          <tr key={a.id} className="border-b border-slate-100 align-middle hover:bg-slate-50">
                            <td className="px-2 py-1.5">
                              {editing ? (
                                <select value={a.kind} onChange={(e) => patch(a.id, { kind: e.target.value })} className={inputCls} style={{ color: k.color }}>
                                  {KINDS.map((x) => (<option key={x.key} value={x.key}>{x.icon} {x.label}</option>))}
                                </select>
                              ) : (
                                <span className="text-xs font-medium" style={{ color: k.color }}>{k.icon} {k.label}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              {editing ? (
                                <input defaultValue={a.title} onBlur={(e) => e.target.value.trim() && e.target.value !== a.title && patch(a.id, { title: e.target.value.trim() })} className={inputCls} />
                              ) : (
                                <span className="block truncate text-xs text-slate-700" title={a.title}>{a.title}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              {editing ? (
                                <input dir="ltr" defaultValue={a.url ?? ""} placeholder="https://…" onBlur={(e) => e.target.value !== (a.url ?? "") && patch(a.id, { url: e.target.value || null })} className={inputCls} />
                              ) : a.url ? (
                                <a href={a.url} target="_blank" rel="noopener noreferrer" dir="ltr" title={a.url} className="block truncate text-xs text-[#3a5bd9] hover:underline">{a.url.replace(/^https?:\/\//, "")}</a>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              {editing ? (
                                <input dir="ltr" defaultValue={a.targetPage ?? ""} placeholder="/page" onBlur={(e) => e.target.value !== (a.targetPage ?? "") && patch(a.id, { targetPage: e.target.value || null })} className={inputCls} />
                              ) : (
                                <span className="block truncate text-xs text-slate-600" dir="ltr" title={a.targetPage ?? ""}>{a.targetPage ?? "—"}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              {editing ? (
                                <input defaultValue={a.anchor ?? ""} onBlur={(e) => e.target.value !== (a.anchor ?? "") && patch(a.id, { anchor: e.target.value || null })} className={inputCls} />
                              ) : (
                                <span className="block truncate text-xs text-slate-600" title={a.anchor ?? ""}>{a.anchor ?? "—"}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              {/* סטטוס תמיד חי — שינוי סטטוס הוא הפעולה היומיומית */}
                              <select
                                value={a.status}
                                onChange={(e) => patch(a.id, { status: e.target.value })}
                                className={`${inputCls} font-medium`}
                                style={{ borderColor: st.color, color: st.color, backgroundColor: `${st.color}14` }}
                              >
                                {STATUSES.map((x) => (<option key={x.key} value={x.key} style={{ color: "#0f172a" }}>{x.label}</option>))}
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              {editing ? (
                                <select value={a.assignee?.id ?? ""} onChange={(e) => patch(a.id, { assigneeId: e.target.value || null })} className={inputCls}>
                                  <option value="">—</option>
                                  {users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
                                </select>
                              ) : (
                                <span className="block truncate text-xs text-slate-600">{a.assignee?.name ?? "—"}</span>
                              )}
                            </td>
                            {isManager ? (
                              <td className="px-2 py-1.5">
                                {editing ? (
                                  <input type="number" dir="ltr" defaultValue={a.cost ?? ""} placeholder="₪" onBlur={(e) => Number(e.target.value || 0) !== (a.cost ?? 0) && patch(a.id, { cost: e.target.value === "" ? null : Number(e.target.value) })} className={inputCls} />
                                ) : (
                                  <span className="text-xs text-slate-600">{a.cost != null ? ILS(a.cost) : "—"}</span>
                                )}
                              </td>
                            ) : null}
                            <td className="px-1 py-1.5">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => setImagesFor({ action: a, clientId: b.client.id })}
                                  title={imgs.length ? `${imgs.length} תמונות ביצוע — לחצו לצפייה/הוספה` : "הוספת תמונה / צילום מסך של הביצוע"}
                                  className={`transition ${imgs.length ? "text-[#3a5bd9]" : "text-slate-400 hover:text-[#3a5bd9]"}`}
                                >
                                  📷{imgs.length ? <span className="mr-0.5 align-middle text-[10px] font-bold">{imgs.length}</span> : null}
                                </button>
                                <button
                                  onClick={() => setEditId(editing ? null : a.id)}
                                  title={editing ? "סיום עריכה" : "עריכה"}
                                  className={`transition ${editing ? "text-emerald-600" : "text-slate-400 hover:text-[#3a5bd9]"}`}
                                >
                                  {editing ? "✔" : <Icon name="edit" className="h-3.5 w-3.5" />}
                                </button>
                                {editing ? (
                                  <button onClick={() => del(a.id)} title="מחיקה" className="text-slate-400 transition hover:text-rose-500">
                                    <Icon name="trash" className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {b.actions.length === 0 ? (
                        <tr><td colSpan={isManager ? 9 : 8} className="px-3 py-3 text-center text-[11px] text-slate-500">אין פעולות בחודש הזה — הוסיפו למעלה.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </Card>
        ))
      )}

      {imagesFor ? (
        <ActionImagesModal
          action={imagesFor.action}
          clientId={imagesFor.clientId}
          onClose={() => setImagesFor(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}

// 📷 תמונות ביצוע לפעולה: צפייה, העלאה (צילום מסך/תמונה) ומחיקה.
function ActionImagesModal({
  action,
  clientId,
  onClose,
  onChanged,
}: {
  action: Action;
  clientId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [list, setList] = useState<{ key: string; name: string }[]>(imageList(action));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveList(next: { key: string; name: string }[]) {
    setList(next);
    await api(`/api/organic/${action.id}`, { method: "PATCH", json: { images: next } });
    onChanged();
  }

  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      let key: string;
      let name = file.name;
      if (file.size > 3_500_000) {
        const pres = await api<{ target: { url: string; headers: Record<string, string> }; key: string }>(
          "/api/uploads/presign",
          { method: "POST", json: { clientId, category: "seo", fileName: file.name, mimeType: file.type || "image/png", size: file.size } }
        );
        const put = await fetch(pres.target.url, { method: "PUT", headers: pres.target.headers, body: file });
        if (!put.ok) throw new Error("העלאה נכשלה");
        key = pres.key;
      } else {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", "seo");
        fd.append("clientId", clientId);
        const up = await fetch("/api/uploads/direct", { method: "POST", body: fd });
        const uj = await up.json();
        if (!up.ok) throw new Error(uj.error || "העלאה נכשלה");
        key = uj.key;
        name = uj.fileName || name;
      }
      await saveList([...list, { key, name }]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`📷 תמונות ביצוע — ${action.title}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {list.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            אין תמונות עדיין — העלו צילום מסך של הביצוע 👇
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {list.map((img, i) => (
              <div key={img.key} className="group relative overflow-hidden rounded-xl border border-slate-200">
                <a href={`/api/organic/${action.id}/image?i=${i}`} target="_blank" rel="noopener noreferrer" title={img.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/organic/${action.id}/image?i=${i}`} alt={img.name} className="h-32 w-full object-cover" />
                </a>
                <button
                  onClick={() => confirm("להסיר את התמונה?") && saveList(list.filter((_, x) => x !== i))}
                  title="הסרת התמונה"
                  className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 text-xs text-rose-500 opacity-0 shadow transition group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600 transition hover:border-[#3a5bd9] hover:text-[#3a5bd9]">
          <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => upload(e.target.files?.[0] ?? null)} />
          {busy ? "מעלה…" : "📎 הוספת תמונה / צילום מסך"}
        </label>
      </div>
    </Modal>
  );
}

// שורת הוספה מהירה: סוג + תיאור (+עלות למנהל) → נכנס בראש הבלוק.
function QuickAdd({
  clientId,
  month,
  users,
  isManager,
  onAdded,
}: {
  clientId: string;
  month: string;
  users: { id: string; name: string }[];
  isManager: boolean;
  onAdded: () => void;
}) {
  const [kind, setKind] = useState("link");
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const inputCls =
    "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-[#3a5bd9] focus:outline-none";

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api("/api/organic", {
        method: "POST",
        json: {
          clientId,
          month,
          kind,
          title: title.trim(),
          assigneeId: assigneeId || null,
          cost: isManager && cost !== "" ? Number(cost) : null,
        },
      });
      setTitle("");
      setCost("");
      onAdded();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/50 px-3 py-2">
      <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
        {KINDS.map((x) => (<option key={x.key} value={x.key}>{x.icon} {x.label}</option>))}
      </select>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="מה בוצע? (למשל: מאמר — מדריך משכנתאות באתר xyz)"
        className={`${inputCls} min-w-64 flex-1`}
      />
      <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputCls} title="מבצע/ת">
        <option value="">מבצע/ת…</option>
        {users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
      </select>
      {isManager ? (
        <input type="number" dir="ltr" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="עלות ₪" className={`${inputCls} w-24`} />
      ) : null}
      <Button size="sm" disabled={busy || !title.trim()} onClick={add}>
        <Icon name="plus" className="h-3.5 w-3.5" />
        הוספה
      </Button>
    </div>
  );
}

// עורך המכסה החודשית של לקוח.
function QuotaEditor({
  clientId,
  quota,
  onSaved,
  onCancel,
}: {
  clientId: string;
  quota: Quota | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    links: quota?.links ?? 0,
    content: quota?.content ?? 0,
    onsite: quota?.onsite ?? 0,
    updates: quota?.updates ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const inputCls =
    "w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center text-xs text-slate-700 focus:border-[#3a5bd9] focus:outline-none";

  async function save() {
    setBusy(true);
    try {
      await api("/api/organic/quota", { method: "POST", json: { clientId, ...form } });
      onSaved();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const fields: { key: keyof typeof form; label: string }[] = [
    { key: "links", label: "🔗 לינקים" },
    { key: "content", label: "✍️ תכנים" },
    { key: "onsite", label: "⚙️ אופטימיזציות" },
    { key: "updates", label: "🛠️ עדכוני אתר" },
  ];

  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 bg-[#3a5bd9]/[0.03] px-4 py-3">
      <span className="text-xs font-bold text-slate-700">מכסה חודשית:</span>
      {fields.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-[11px] text-slate-500">
          {f.label}
          <input
            type="number"
            min={0}
            value={form[f.key]}
            onChange={(e) => setForm({ ...form, [f.key]: Math.max(0, Number(e.target.value) || 0) })}
            className={inputCls}
          />
        </label>
      ))}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={save}>שמירה</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>ביטול</Button>
      </div>
    </div>
  );
}
