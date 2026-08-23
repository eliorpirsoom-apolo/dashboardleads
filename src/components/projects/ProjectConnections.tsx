"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { CHANNELS } from "@/lib/defaults";
import { Button, Card, Chip, Field, Input, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface Source {
  id: string;
  name: string;
  token: string;
  channel: string | null;
  platform: string | null;
  kind: string;
  active: boolean;
  lastSeenAt: string | null;
  _count: { leads: number };
}

interface MetaPageRow {
  id: string;
  pageId: string;
  pageName: string;
  active: boolean;
  lastLeadAt: string | null;
  lastError: string | null;
  source: { name: string; _count: { leads: number } } | null;
}

// קבוצות התצוגה: טלפונים / טפסים ואתרים / וואטסאפ.
const GROUPS: { kind: string; label: string; icon: string; hint: string }[] = [
  { kind: "call", label: "📞 טלפונים", icon: "phone", hint: "מספרי פייקול/CheckCall — הכתובת מודבקת בפאנל של פייקול" },
  { kind: "form", label: "📝 טפסים ואתרים", icon: "link", hint: "טפסי אלמנטור, Make/Zapier וטפסים מאתרים" },
  { kind: "whatsapp", label: "💬 וואטסאפ", icon: "whatsapp", hint: "לידים נכנסים מוואטסאפ" },
];

// חיבורי הפרויקט (Webhooks) — צד משרד בלבד: הטוקנים הם סודות.
// כל מקור שנוצר כאן משויך אוטומטית לפרויקט, והלידים ממנו נכנסים ישר
// לפרויקט ולמשווק הראשי שלו.
export default function ProjectConnections({
  clientId,
  projectId,
}: {
  clientId: string;
  projectId: string;
}) {
  const [sources, setSources] = useState<Source[]>([]);
  const [metaPages, setMetaPages] = useState<MetaPageRow[]>([]);
  const [metaEnabled, setMetaEnabled] = useState(true);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("form");
  const [channel, setChannel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ sources: Source[] }>(
        `/api/sources?clientId=${clientId}&projectId=${projectId}`
      );
      setSources(d.sources);
    } catch (e: any) {
      setError(e.message);
    }
    try {
      const m = await api<{ enabled: boolean; pages: MetaPageRow[] }>(
        `/api/integrations/meta/pages?projectId=${projectId}`
      );
      setMetaPages(m.pages);
      setMetaEnabled(m.enabled);
    } catch {
      /* אינטגרציית Meta לא זמינה — הכרטיס יציג חיבור בלבד */
    }
  }, [clientId, projectId]);
  useEffect(() => {
    load();
  }, [load]);

  async function disconnectMeta(p: MetaPageRow) {
    if (!confirm(`לנתק את העמוד "${p.pageName}"? לידים חדשים מפייסבוק יפסיקו להיכנס. הלידים הקיימים נשארים.`)) return;
    try {
      await api(`/api/integrations/meta/pages?id=${p.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const [pulling, setPulling] = useState("");
  const [routingFor, setRoutingFor] = useState<string | null>(null); // עורך ניתוב טפסים פתוח
  async function pullMeta(p: MetaPageRow) {
    setPulling(p.id);
    setError("");
    try {
      const r = await api<{ forms: number; scanned: number; sent: number }>(
        "/api/integrations/meta/pull",
        { method: "POST", json: { id: p.id, days: 30 } }
      );
      alert(`נמשכו ${r.sent} לידים (נסרקו ${r.scanned} מ-${r.forms} טפסים, 30 יום אחורה). כפילויות סוננו אוטומטית.`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPulling("");
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/sources", {
        method: "POST",
        json: { clientId, projectId, name, kind, channel: channel || null },
      });
      setName("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function webhookUrl(token: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/api/intake/${token}`;
  }

  async function copy(token: string) {
    await navigator.clipboard.writeText(webhookUrl(token));
    setCopied(token);
    setTimeout(() => setCopied(""), 1500);
  }

  async function toggleActive(s: Source) {
    await api(`/api/sources/${s.id}`, { method: "PATCH", json: { active: !s.active } });
    load();
  }

  return (
    <Card>
      <h3 className="mb-1 text-base font-bold text-slate-800">חיבורי הפרויקט (Webhooks)</h3>
      <p className="mb-4 text-xs text-slate-500">
        טלפונים, טפסים ואתרים שמזרימים לידים ישירות לפרויקט הזה — ולמשווק הראשי שלו.
        מעתיקים את הכתובת ומדביקים בפאנל פייקול / טופס אלמנטור / Make.
      </p>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      {/* חיבור ישיר לפייסבוק (Meta Lead Ads) — לידים בזמן אמת, בלי גשר באמצע */}
      <div className="mb-4">
        <p className="mb-1.5 text-sm font-bold text-slate-700">📘 פייסבוק — חיבור ישיר</p>
        {metaPages.length === 0 ? (
          <p className="mb-2 text-xs text-slate-400">
            חיבור עמוד פייסבוק מזרים את הלידים מטפסי הפייסבוק ישירות לפרויקט תוך שניות — בלי מנהל לידים באמצע.
          </p>
        ) : (
          <div className="mb-2 flex flex-col gap-2">
            {metaPages.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">📘 {p.pageName}</span>
                  {!p.active ? <Chip color="#f87171">כבוי</Chip> : p.lastError ? <Chip color="#f59e0b">שגיאה</Chip> : <Chip color="#34d399">מחובר</Chip>}
                  <span className="text-xs text-slate-500">
                    {p.source?._count.leads ?? 0} לידים
                    {p.lastLeadAt ? ` · ליד אחרון ${formatDateTime(p.lastLeadAt)}` : " · טרם התקבלו לידים"}
                  </span>
                  <div className="mr-auto flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setRoutingFor(routingFor === p.id ? null : p.id)} title="ניתוב כל טופס פייסבוק לפרויקט משלו">
                      🗂 ניתוב טפסים
                    </Button>
                    <Button variant="ghost" size="sm" disabled={pulling === p.id} onClick={() => pullMeta(p)} title="משיכת הלידים מ-30 הימים האחרונים מהטפסים של העמוד (כפילויות מסוננות)">
                      {pulling === p.id ? "מושך…" : "משיכת לידים אחרונים"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => disconnectMeta(p)}>ניתוק</Button>
                  </div>
                </div>
                {p.lastError ? (
                  <p className="mt-1 text-[11px] text-amber-700">{p.lastError}</p>
                ) : null}
                {routingFor === p.id ? <FormRoutingEditor metaPageId={p.id} onClose={() => setRoutingFor(null)} /> : null}
              </div>
            ))}
          </div>
        )}
        {metaEnabled ? (
          <a
            href={`/api/integrations/meta/connect?projectId=${projectId}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1877f2] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0f66d8]"
          >
            + חיבור עמוד פייסבוק
          </a>
        ) : (
          <p className="text-xs text-amber-700">
            חיבור Meta טרם הוגדר בסביבה (META_APP_ID/SECRET) — פנו למנהל המערכת.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {GROUPS.map((g) => {
          const list = sources.filter((s) => s.kind === g.kind);
          if (list.length === 0 && g.kind === "whatsapp") return null; // וואטסאפ מוצג רק אם קיים
          return (
            <div key={g.kind}>
              <p className="mb-1.5 text-sm font-bold text-slate-700">{g.label}</p>
              {list.length === 0 ? (
                <p className="text-xs text-slate-400">{g.hint} — אין חיבורים עדיין.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {list.map((s) => (
                    <div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Icon name={g.icon} className="h-4 w-4 text-cyan-500" />
                        <span className="text-sm font-medium text-slate-700">{s.name}</span>
                        {!s.active ? <Chip color="#f87171">כבוי</Chip> : null}
                        <span className="text-xs text-slate-500">
                          {s._count.leads} לידים
                          {s.lastSeenAt
                            ? ` · נראה לאחרונה ${formatDateTime(s.lastSeenAt)}`
                            : " · טרם התקבלו לידים"}
                        </span>
                        <div className="mr-auto flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => copy(s.token)}>
                            {copied === s.token ? "הועתק ✓" : "העתקת כתובת"}
                          </Button>
                          <button
                            onClick={() => toggleActive(s)}
                            className="rounded p-1.5 text-slate-500 hover:text-amber-700"
                            title={s.active ? "כיבוי" : "הפעלה"}
                          >
                            <Icon name={s.active ? "x" : "check"} className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <p dir="ltr" className="mt-2 truncate rounded-lg bg-white px-2 py-1 font-mono text-[11px] text-slate-400">
                        {webhookUrl(s.token)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-4">
        <div className="min-w-[180px] flex-1">
          <Field label="חיבור חדש לפרויקט">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='למשל: "טופס אלמנטור — דף נחיתה" או "מספר פייקול 03..."'
              required
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="סוג">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="form">טופס / אתר</option>
              <option value="call">טלפון (פייקול)</option>
              <option value="whatsapp">וואטסאפ</option>
            </Select>
          </Field>
        </div>
        <div className="w-36">
          <Field label="ערוץ ברירת מחדל">
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">—</option>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" disabled={busy}>
          <Icon name="plus" className="h-4 w-4" />
          יצירה
        </Button>
      </form>
    </Card>
  );
}

// עורך ניתוב טפסים: כל טופס Lead Ads של העמוד → פרויקט יעד משלו.
// טופס בלי בחירה נופל לפרויקט של החיבור (ברירת המחדל).
function FormRoutingEditor({ metaPageId, onClose }: { metaPageId: string; onClose: () => void }) {
  const [data, setData] = useState<{
    forms: { id: string; name: string; status: string }[];
    routing: { formId: string; formName?: string; projectId: string }[];
    projects: { id: string; name: string }[];
    defaultProjectId: string | null;
  } | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<typeof data & object>(`/api/integrations/meta/forms?id=${metaPageId}`)
      .then((d: any) => {
        setData(d);
        const m: Record<string, string> = {};
        for (const r of d.routing) m[r.formId] = r.projectId;
        setMap(m);
      })
      .catch((e) => setMsg("שגיאה: " + e.message));
  }, [metaPageId]);

  async function save() {
    if (!data) return;
    setBusy(true);
    setMsg("");
    try {
      const routing = Object.entries(map)
        .filter(([, projectId]) => projectId)
        .map(([formId, projectId]) => ({
          formId,
          formName: data.forms.find((f) => f.id === formId)?.name,
          projectId,
        }));
      await api("/api/integrations/meta/forms", { method: "POST", json: { id: metaPageId, routing } });
      setMsg("הניתוב נשמר ✓ — לידים חדשים ינותבו לפי הטבלה");
    } catch (e: any) {
      setMsg("שגיאה: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  if (msg.startsWith("שגיאה") && !data) return <p className="mt-2 text-xs text-red-600">{msg}</p>;
  if (!data) return <p className="mt-2 text-xs text-slate-500">טוען את טפסי העמוד מפייסבוק…</p>;

  const defaultName = data.projects.find((p) => p.id === data.defaultProjectId)?.name;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-bold text-slate-700">
        ניתוב טפסים — כל טופס נשלח לפרויקט שנבחר לו
        {defaultName ? <span className="font-normal text-slate-400"> · ללא בחירה = {defaultName}</span> : null}
      </p>
      {data.forms.length === 0 ? (
        <p className="text-xs text-slate-500">לא נמצאו טפסי Lead Ads בעמוד.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {data.forms.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="min-w-48 flex-1 truncate font-medium text-slate-700" title={f.name}>
                📝 {f.name}
                {f.status && f.status !== "ACTIVE" ? <span className="mr-1 text-slate-400">({f.status.toLowerCase()})</span> : null}
              </span>
              <select
                value={map[f.id] ?? ""}
                onChange={(e) => setMap((m) => ({ ...m, [f.id]: e.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-[#3a5bd9] focus:outline-none"
              >
                <option value="">ברירת מחדל{defaultName ? ` (${defaultName})` : ""}</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={save}>{busy ? "שומר…" : "שמירת ניתוב"}</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>סגירה</Button>
        {msg ? <span className={`text-[11px] ${msg.startsWith("שגיאה") ? "text-red-600" : "text-emerald-600"}`}>{msg}</span> : null}
      </div>
    </div>
  );
}
