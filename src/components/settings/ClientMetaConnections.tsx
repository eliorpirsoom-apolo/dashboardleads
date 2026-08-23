"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Chip } from "@/components/ui";

interface MetaPageRow {
  id: string;
  pageId: string;
  pageName: string;
  active: boolean;
  lastLeadAt: string | null;
  lastError: string | null;
  projectId: string | null;
  project: { name: string } | null;
  source: { name: string; _count: { leads: number } } | null;
}

// חיבורי פייסבוק של הלקוח — העמוד שייך ללקוח, לא לפרויקט. כל טופס Lead Ads
// מנותב לפרויקט משלו דרך "ניתוב טפסים"; טופס לא-משויך משאיר את הלידים אצל
// הלקוח (ללא פרויקט) עד שיוך.
export default function ClientMetaConnections({ clientId }: { clientId: string }) {
  const [pages, setPages] = useState<MetaPageRow[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  const [pulling, setPulling] = useState("");
  const [routingFor, setRoutingFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const m = await api<{ enabled: boolean; pages: MetaPageRow[] }>(
        `/api/integrations/meta/pages?clientId=${clientId}`
      );
      setPages(m.pages);
      setEnabled(m.enabled);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId]);
  useEffect(() => {
    load();
  }, [load]);

  async function disconnect(p: MetaPageRow) {
    if (!confirm(`לנתק את העמוד "${p.pageName}"? לידים חדשים מפייסבוק יפסיקו להיכנס. הלידים הקיימים נשארים.`)) return;
    try {
      await api(`/api/integrations/meta/pages?id=${p.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function pull(p: MetaPageRow) {
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

  return (
    <Card>
      <h3 className="mb-1 text-base font-bold text-slate-800">📘 פייסבוק — עמודים מחוברים</h3>
      <p className="mb-4 text-xs text-slate-500">
        העמוד מחובר ברמת הלקוח. בכל עמוד, &quot;🗂 ניתוב טפסים&quot; קובע לאיזה פרויקט נכנסים
        הלידים של כל טופס — כך שלכל פרויקט יש את הטפסים הבלעדיים שלו. ליד מטופס
        שטרם שויך נשמר אצל הלקוח (ללא פרויקט) עד שמשייכים אותו.
      </p>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      {pages.length === 0 ? (
        <p className="mb-3 text-xs text-slate-400">אין עמוד מחובר עדיין.</p>
      ) : (
        <div className="mb-3 flex flex-col gap-2">
          {pages.map((p) => (
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
                  <Button variant="ghost" size="sm" disabled={pulling === p.id} onClick={() => pull(p)} title="משיכת הלידים מ-30 הימים האחרונים מהטפסים של העמוד (כפילויות מסוננות)">
                    {pulling === p.id ? "מושך…" : "משיכת לידים אחרונים"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => disconnect(p)}>ניתוק</Button>
                </div>
              </div>
              {p.lastError ? <p className="mt-1 text-[11px] text-amber-700">{p.lastError}</p> : null}
              {routingFor === p.id ? (
                <FormRoutingEditor metaPageId={p.id} onSaved={load} onClose={() => setRoutingFor(null)} />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {enabled ? (
        <a
          href={`/api/integrations/meta/connect?clientId=${clientId}`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#1877f2] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0f66d8]"
        >
          + חיבור עמוד פייסבוק
        </a>
      ) : (
        <p className="text-xs text-amber-700">
          חיבור Meta טרם הוגדר בסביבה (META_APP_ID/SECRET) — פנו למנהל המערכת.
        </p>
      )}
    </Card>
  );
}

// עורך ניתוב טפסים: כל טופס Lead Ads של העמוד → פרויקט יעד משלו.
// טופס בלי בחירה נופל לברירת המחדל של החיבור — וברירת המחדל עצמה נשלטת כאן
// ("ללא פרויקט" = הלידים נשמרים ללקוח וממתינים לשיוך).
function FormRoutingEditor({
  metaPageId,
  onSaved,
  onClose,
}: {
  metaPageId: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    forms: { id: string; name: string; status: string }[];
    routing: { formId: string; formName?: string; projectId: string }[];
    projects: { id: string; name: string }[];
    defaultProjectId: string | null;
  } | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [defaultProject, setDefaultProject] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [testing, setTesting] = useState("");

  // ליד בדיקה לטופס — נכנס ל-CRM דרך הוובהוק/המשיכה המחזורית ומוכיח את הצינור.
  async function sendTestLead(formId: string) {
    setTesting(formId);
    setMsg("");
    try {
      await api("/api/integrations/meta/test-lead", {
        method: "POST",
        json: { id: metaPageId, formId },
      });
      setMsg("ליד בדיקה נשלח ✓ — ייכנס ל-CRM תוך עד 5 דקות, לפרויקט של הטופס");
    } catch (e: any) {
      setMsg("שגיאה: " + e.message);
    } finally {
      setTesting("");
    }
  }

  useEffect(() => {
    api<typeof data & object>(`/api/integrations/meta/forms?id=${metaPageId}`)
      .then((d: any) => {
        setData(d);
        const m: Record<string, string> = {};
        for (const r of d.routing) m[r.formId] = r.projectId;
        setMap(m);
        setDefaultProject(d.defaultProjectId ?? "");
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
      await api("/api/integrations/meta/forms", {
        method: "POST",
        json: { id: metaPageId, routing, defaultProjectId: defaultProject || null },
      });
      setMsg("הניתוב נשמר ✓ — לידים חדשים ינותבו לפי הטבלה");
      onSaved();
    } catch (e: any) {
      setMsg("שגיאה: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  if (msg.startsWith("שגיאה") && !data) return <p className="mt-2 text-xs text-red-600">{msg}</p>;
  if (!data) return <p className="mt-2 text-xs text-slate-500">טוען את טפסי העמוד מפייסבוק…</p>;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-bold text-slate-700">
        ניתוב טפסים — כל טופס נשלח לפרויקט שנבחר לו
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
                <option value="">— לפי ברירת המחדל —</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                disabled={testing === f.id}
                onClick={() => sendTestLead(f.id)}
                className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-500 transition hover:border-[#3a5bd9] hover:text-[#3a5bd9] disabled:opacity-50"
                title="שליחת ליד בדיקה לטופס הזה — לבדיקת כל הצינור עד ה-CRM"
              >
                {testing === f.id ? "שולח…" : "🧪 ליד בדיקה"}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs">
        <span className="font-medium text-slate-600">טופס חדש / ללא שיוך ←</span>
        <select
          value={defaultProject}
          onChange={(e) => setDefaultProject(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-[#3a5bd9] focus:outline-none"
        >
          <option value="">ללא פרויקט — הלידים ממתינים לשיוך אצל הלקוח</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={save}>{busy ? "שומר…" : "שמירת ניתוב"}</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>סגירה</Button>
        {msg ? <span className={`text-[11px] ${msg.startsWith("שגיאה") ? "text-red-600" : "text-emerald-600"}`}>{msg}</span> : null}
      </div>
    </div>
  );
}
