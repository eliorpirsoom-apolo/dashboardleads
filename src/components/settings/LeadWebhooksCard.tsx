"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Chip, Field, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { useCollapse, CollapseBtn } from "@/components/settings/Collapse";

// ---------------------------------------------------------------------------
// שיגור לידים החוצה (Outbound) — יעדי webhook פר-לקוח/פרויקט.
// כל ליד חדש נדחף אוטומטית לכל יעד מתאים. צד משרד בלבד (מפתחות = סודות).
// ---------------------------------------------------------------------------

interface Webhook {
  id: string;
  projectId: string | null;
  name: string;
  url: string;
  method: string;
  format: string;
  authHeader: string | null;
  authValue: string | null;
  secret: string | null;
  fieldMap: string | null;
  active: boolean;
  lastStatus: string | null;
  lastError: string | null;
  lastSentAt: string | null;
  project: { id: string; name: string } | null;
  _count: { logs: number };
}

interface ProjectOpt {
  id: string;
  name: string;
  status: string;
}

interface ForwardLog {
  id: string;
  leadId: string | null;
  status: string;
  httpCode: number | null;
  error: string | null;
  responseBody: string | null;
  attempt: number;
  createdAt: string;
}

type Draft = {
  projectId: string;
  name: string;
  url: string;
  method: string;
  format: string;
  authHeader: string;
  authValue: string;
  secret: string;
  fieldMap: string;
};

const EMPTY_DRAFT: Draft = {
  projectId: "",
  name: "",
  url: "",
  method: "POST",
  format: "json",
  authHeader: "",
  authValue: "",
  secret: "",
  fieldMap: "",
};

const MAP_PLACEHOLDER = `(אופציונלי) מיפוי לשמות שה-API דורש. ערך רגיל = שדה מהליד;
ערך שמתחיל ב-= הוא קבוע (לפרמטרים קבועים כמו מפתח/מזהה פרויקט):
{
  "apikey": "=<הדביקו-כאן-מפתח>",
  "projectid": "=<מזהה>",
  "fullname": "fullName",
  "phone": "phone",
  "email": "email",
  "utm_source": "custom.utm_source"
}`;

export default function LeadWebhooksCard({ clientId }: { clientId: string }) {
  const [collapsed, toggleCollapse] = useCollapse(`lead-webhooks-${clientId}`);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null); // id | "new" | null
  const [logsFor, setLogsFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, p] = await Promise.all([
        api<{ webhooks: Webhook[] }>(`/api/lead-webhooks?clientId=${clientId}`),
        api<{ projects: ProjectOpt[] }>(`/api/projects?clientId=${clientId}`),
      ]);
      setWebhooks(w.webhooks);
      setProjects(p.projects.filter((x) => x.status === "active"));
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId]);
  useEffect(() => {
    load();
  }, [load]);

  async function save(id: string | "new", draft: Draft) {
    const payload = {
      ...(id === "new" ? { clientId } : {}),
      projectId: draft.projectId || null,
      name: draft.name.trim(),
      url: draft.url.trim(),
      method: draft.method,
      format: draft.format,
      authHeader: draft.authHeader.trim() || null,
      authValue: draft.authValue.trim() || null,
      secret: draft.secret.trim() || null,
      fieldMap: draft.fieldMap.trim() || null,
    };
    if (id === "new") {
      await api("/api/lead-webhooks", { method: "POST", json: payload });
    } else {
      await api(`/api/lead-webhooks/${id}`, { method: "PATCH", json: payload });
    }
    setEditing(null);
    await load();
  }

  async function toggleActive(w: Webhook) {
    try {
      await api(`/api/lead-webhooks/${w.id}`, { method: "PATCH", json: { active: !w.active } });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(w: Webhook) {
    if (!confirm(`למחוק את יעד השיגור "${w.name}"? לידים חדשים יפסיקו להישלח לשם. פעולה בלתי הפיכה.`)) return;
    try {
      await api(`/api/lead-webhooks/${w.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const scopeLabel = (w: Webhook) => (w.project ? `פרויקט: ${w.project.name}` : "כל הפרויקטים של הלקוח");

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-800">📤 שיגור לידים ל-API חיצוני</h3>
        <CollapseBtn collapsed={collapsed} onClick={toggleCollapse} />
      </div>
      {collapsed ? null : (
        <>
          <p className="mb-4 text-xs text-slate-500">
            כל ליד חדש שנכנס נדחף אוטומטית למערכת החיצונית (GoHighLevel, CRM אחר, Make וכו׳).
            אפשר להצמיד יעד לפרויקט מסוים או לכל הלקוח. השיגור לא-חוסם — כשל אצל היעד לא מפריע
            לקליטת הליד אצלנו, והכל נרשם ביומן.
          </p>

          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

          {webhooks.length === 0 ? (
            <p className="mb-3 text-xs text-slate-400">אין יעדי שיגור עדיין — הוסיפו את הראשון למטה.</p>
          ) : (
            <div className="mb-3 flex flex-col gap-2">
              {webhooks.map((w) =>
                editing === w.id ? (
                  <WebhookForm
                    key={w.id}
                    initial={{
                      projectId: w.projectId ?? "",
                      name: w.name,
                      url: w.url,
                      method: w.method,
                      format: w.format,
                      authHeader: w.authHeader ?? "",
                      authValue: w.authValue ?? "",
                      secret: w.secret ?? "",
                      fieldMap: w.fieldMap ?? "",
                    }}
                    projects={projects}
                    onCancel={() => setEditing(null)}
                    onSave={(d) => save(w.id, d)}
                  />
                ) : (
                  <div key={w.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon name="link" className="h-4 w-4 shrink-0 text-cyan-500" />
                      <span className="text-sm font-medium text-slate-700">{w.name}</span>
                      {!w.active ? (
                        <Chip color="#f87171">כבוי</Chip>
                      ) : w.lastStatus === "error" ? (
                        <Chip color="#f59e0b">שגיאה אחרונה</Chip>
                      ) : w.lastStatus === "ok" ? (
                        <Chip color="#34d399">פעיל</Chip>
                      ) : (
                        <Chip color="#94a3b8">טרם נשלח</Chip>
                      )}
                      <span className="text-[11px] text-slate-400">{scopeLabel(w)}</span>
                      <div className="mr-auto flex items-center gap-1">
                        <TestButton id={w.id} />
                        <Button variant="ghost" size="sm" onClick={() => setLogsFor(logsFor === w.id ? null : w.id)}>
                          יומן ({w._count.logs})
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(w.id)}>
                          עריכה
                        </Button>
                        <button
                          onClick={() => toggleActive(w)}
                          className="rounded p-1.5 text-slate-500 hover:text-amber-700"
                          title={w.active ? "כיבוי" : "הפעלה"}
                        >
                          <Icon name={w.active ? "x" : "check"} className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(w)}
                          className="rounded p-1.5 text-slate-400 hover:text-red-600"
                          title="מחיקה"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <p dir="ltr" className="mt-2 truncate rounded-lg bg-white px-2 py-1 font-mono text-[11px] text-slate-400">
                      {w.method} {w.url}
                    </p>
                    {w.lastSentAt ? (
                      <p className="mt-1 text-[11px] text-slate-400">
                        מסירה אחרונה: {formatDateTime(w.lastSentAt)}
                        {w.lastStatus === "error" && w.lastError ? ` · שגיאה: ${w.lastError}` : ""}
                      </p>
                    ) : null}
                    {logsFor === w.id ? <LogsPanel webhookId={w.id} /> : null}
                  </div>
                )
              )}
            </div>
          )}

          {editing === "new" ? (
            <WebhookForm
              initial={EMPTY_DRAFT}
              projects={projects}
              onCancel={() => setEditing(null)}
              onSave={(d) => save("new", d)}
            />
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setEditing("new")}>
              <Icon name="plus" className="h-4 w-4" />
              יעד שיגור חדש
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

// כפתור בדיקת חיבור — שולח מעטפת-דוגמה ליעד ומציג את התוצאה.
function TestButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  async function test() {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; httpCode: number | null; error: string | null }>(
        `/api/lead-webhooks/${id}/test`,
        { method: "POST" }
      );
      if (r.ok) alert(`בדיקת חיבור הצליחה ✓ (HTTP ${r.httpCode ?? "?"}) — נשלח ליד-דוגמה ליעד.`);
      else alert(`בדיקת חיבור נכשלה ✗ — ${r.error ?? "שגיאה לא ידועה"}${r.httpCode ? ` (HTTP ${r.httpCode})` : ""}`);
    } catch (e: any) {
      alert("שגיאה: " + e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="ghost" size="sm" disabled={busy} onClick={test} title="שליחת ליד-דוגמה ליעד לבדיקת החיבור">
      {busy ? "בודק…" : "🧪 בדיקה"}
    </Button>
  );
}

// יומן המסירות של יעד (30 אחרונות, חדש-למעלה).
function LogsPanel({ webhookId }: { webhookId: string }) {
  const [logs, setLogs] = useState<ForwardLog[] | null>(null);
  useEffect(() => {
    api<{ logs: ForwardLog[] }>(`/api/lead-webhooks/${webhookId}/logs`)
      .then((d) => setLogs(d.logs))
      .catch(() => setLogs([]));
  }, [webhookId]);
  if (!logs) return <p className="mt-2 text-[11px] text-slate-400">טוען יומן…</p>;
  if (logs.length === 0) return <p className="mt-2 text-[11px] text-slate-400">אין מסירות עדיין.</p>;
  return (
    <div className="mt-2 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2">
      {logs.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className={l.status === "ok" ? "text-emerald-600" : "text-red-600"}>
            {l.status === "ok" ? "✓" : "✗"}
          </span>
          <span className="text-slate-500">{formatDateTime(l.createdAt)}</span>
          {l.httpCode ? <span className="text-slate-400">HTTP {l.httpCode}</span> : null}
          {l.leadId && l.leadId !== "test" ? null : <span className="text-slate-400">בדיקה</span>}
          {l.error ? <span className="truncate text-amber-700" title={l.error}>{l.error}</span> : null}
          {l.attempt > 1 ? <span className="text-slate-400">({l.attempt} ניסיונות)</span> : null}
        </div>
      ))}
    </div>
  );
}

// טופס הוספה/עריכה של יעד.
function WebhookForm({
  initial,
  projects,
  onCancel,
  onSave,
}: {
  initial: Draft;
  projects: ProjectOpt[];
  onCancel: () => void;
  onSave: (d: Draft) => Promise<void>;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof Draft, v: string) => setD((prev) => ({ ...prev, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await onSave(d);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-[#3a5bd9]/30 bg-white p-3">
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[180px] flex-1">
          <Field label="שם היעד">
            <Input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder='למשל: "GoHighLevel" / "ה-CRM של הלקוח"' required />
          </Field>
        </div>
        <div className="w-52">
          <Field label="היקף">
            <Select value={d.projectId} onChange={(e) => set("projectId", e.target.value)}>
              <option value="">כל הפרויקטים של הלקוח</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  פרויקט: {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <Field label="כתובת היעד (URL)">
        <Input dir="ltr" value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="https://services.leadconnectorhq.com/hooks/..." required />
      </Field>

      <div className="flex flex-wrap gap-3">
        <div className="w-32">
          <Field label="שיטה">
            <Select value={d.method} onChange={(e) => set("method", e.target.value)}>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
            </Select>
          </Field>
        </div>
        <div className="w-36">
          <Field label="פורמט">
            <Select value={d.format} onChange={(e) => set("format", e.target.value)}>
              <option value="json">JSON</option>
              <option value="form">Form (urlencoded)</option>
            </Select>
          </Field>
        </div>
      </div>

      <details className="rounded-lg border border-slate-200 bg-slate-50 p-2">
        <summary className="cursor-pointer text-xs font-medium text-slate-600">אימות ומיפוי שדות (אופציונלי)</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[11px] text-slate-400">
            ל-GoHighLevel אין צורך באימות — הכתובת עצמה היא הסוד. למערכות אחרות: שם כותרת + ערך
            (למשל Authorization / Bearer xxx), או סוד לחתימת HMAC.
          </p>
          <div className="flex flex-wrap gap-3">
            <div className="w-44">
              <Field label="שם כותרת אימות">
                <Input dir="ltr" value={d.authHeader} onChange={(e) => set("authHeader", e.target.value)} placeholder="Authorization" />
              </Field>
            </div>
            <div className="min-w-[180px] flex-1">
              <Field label="ערך הכותרת / מפתח">
                <Input dir="ltr" value={d.authValue} onChange={(e) => set("authValue", e.target.value)} placeholder="Bearer xxxxx" />
              </Field>
            </div>
            <div className="w-44">
              <Field label="סוד HMAC">
                <Input dir="ltr" value={d.secret} onChange={(e) => set("secret", e.target.value)} placeholder="(אופציונלי)" />
              </Field>
            </div>
          </div>
          <Field label="מיפוי שדות">
            <Textarea dir="ltr" rows={7} value={d.fieldMap} onChange={(e) => set("fieldMap", e.target.value)} placeholder={MAP_PLACEHOLDER} className="font-mono text-[11px]" />
          </Field>
          <p className="text-[11px] text-slate-400">
            בלי מיפוי (ברירת מחדל) — נשלחים <b>כל נתוני הליד</b>: פרטי קשר, מקור/UTM, שיוך פנימי,
            נתוני שיחה, תאריכים וכל השדות המותאמים — והמערכת הקולטת בוחרת מה למפות אצלה. עם מיפוי —
            נשלחים רק השדות שהגדרתם, בשמות שה-API של היעד דורש.
          </p>
        </div>
      </details>

      {err ? <p className="text-xs text-red-600">{err}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "שומר…" : "שמירה"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </form>
  );
}
