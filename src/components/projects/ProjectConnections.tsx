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

// תצוגת טפסי פייסבוק של הפרויקט: העמודים מחוברים ברמת הלקוח (הגדרות הלקוח),
// וכאן כל פרויקט רואה ומנהל רק את הטפסים שמנותבים אליו.
interface MetaFormsPage {
  id: string; // metaPage db id
  pageName: string;
  defaultProjectId: string | null;
  routing: { formId: string; formName?: string; projectId: string }[];
  forms: { id: string; name: string; status: string }[];
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
  const [metaPages, setMetaPages] = useState<MetaFormsPage[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);
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
      const m = await api<{ pages: MetaFormsPage[] }>(
        `/api/integrations/meta/forms?projectId=${projectId}`
      );
      setMetaPages(m.pages);
    } catch {
      /* אין חיבור פייסבוק ללקוח / אין הרשאה — הפאנל פשוט לא יוצג */
    } finally {
      setMetaLoading(false);
    }
  }, [clientId, projectId]);
  useEffect(() => {
    load();
  }, [load]);

  // צירוף/שחרור טופס: עדכון ניתוב העמוד בלי לגעת בברירת המחדל שלו.
  const [formBusy, setFormBusy] = useState("");
  async function setFormRouting(page: MetaFormsPage, formId: string, target: string | null) {
    setFormBusy(formId);
    setError("");
    try {
      const form = page.forms.find((f) => f.id === formId);
      const routing = page.routing
        .filter((r) => r.formId !== formId)
        .concat(target ? [{ formId, formName: form?.name, projectId: target }] : []);
      await api("/api/integrations/meta/forms", {
        method: "POST",
        json: { id: page.id, routing },
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFormBusy("");
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

      {/* טפסי פייסבוק של הפרויקט — העמוד מחובר ברמת הלקוח; כאן רק הטפסים
          שמנותבים לפרויקט הזה + צירוף טפסים פנויים. */}
      {!metaLoading && metaPages.length > 0 ? (
        <div className="mb-4">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-slate-700">📘 טפסי פייסבוק</p>
            <a
              href={`/admin/clients/${clientId}/settings`}
              className="text-xs font-medium text-[#3a5bd9] hover:underline"
            >
              ניהול חיבור העמודים — בהגדרות הלקוח ←
            </a>
          </div>
          {(() => {
            const mine: { page: MetaFormsPage; form: MetaFormsPage["forms"][number]; viaDefault: boolean }[] = [];
            const free: { page: MetaFormsPage; form: MetaFormsPage["forms"][number] }[] = [];
            for (const page of metaPages) {
              for (const form of page.forms) {
                const rule = page.routing.find((r) => r.formId === form.id);
                if (rule?.projectId === projectId) mine.push({ page, form, viaDefault: false });
                else if (!rule && page.defaultProjectId === projectId) mine.push({ page, form, viaDefault: true });
                else if (!rule && !page.defaultProjectId) free.push({ page, form });
              }
            }
            return (
              <>
                {mine.length === 0 ? (
                  <p className="mb-2 text-xs text-slate-400">אין טפסים משויכים לפרויקט הזה עדיין.</p>
                ) : (
                  <div className="mb-2 flex flex-col gap-1.5">
                    {mine.map(({ page, form, viaDefault }) => (
                      <div key={form.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <span className="font-medium text-slate-700">📝 {form.name}</span>
                        <span className="text-[11px] text-slate-400">{page.pageName}</span>
                        {viaDefault ? <Chip color="#94a3b8">דרך ברירת המחדל</Chip> : null}
                        {!viaDefault ? (
                          <div className="mr-auto">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={formBusy === form.id}
                              onClick={() => setFormRouting(page, form.id, null)}
                              title="שחרור — הטופס חוזר לברירת המחדל של החיבור (בהגדרות הלקוח)"
                            >
                              {formBusy === form.id ? "…" : "שחרור"}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
                {free.length > 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-2">
                    <p className="mb-1 text-[11px] font-medium text-slate-500">טפסים פנויים (ללא שיוך) — לחיצה מצרפת לפרויקט הזה:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {free.map(({ page, form }) => (
                        <button
                          key={form.id}
                          disabled={formBusy === form.id}
                          onClick={() => setFormRouting(page, form.id, projectId)}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 transition hover:border-[#3a5bd9] hover:text-[#3a5bd9]"
                          title={`צירוף הטופס לפרויקט (עמוד: ${page.pageName})`}
                        >
                          {formBusy === form.id ? "מצרף…" : `+ ${form.name}`}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}

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

// עורך ניתוב הטפסים המלא עבר לכרטיס הפייסבוק בהגדרות הלקוח
// (components/settings/ClientMetaConnections.tsx) — העמוד שייך ללקוח.
