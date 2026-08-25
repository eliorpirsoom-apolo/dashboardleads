"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { Button, Card, Chip, Field, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { useCollapse, CollapseBtn } from "@/components/settings/Collapse";
import Modal from "@/components/Modal";

interface Automation {
  id: string;
  name: string;
  trigger: string;
  channel: string;
  recipientType: string;
  customRecipients: string | null;
  template: string;
  leadKind: string | null;
  mediaKey: string | null;
  mediaName: string | null;
  cooldownHours: number | null;
  active: boolean;
  status: { id: string; name: string; color: string } | null;
}

interface StatusOpt {
  id: string;
  name: string;
  color: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  email: "אימייל",
  sms: "SMS",
  whatsapp: "וואטסאפ",
};
const RECIPIENT_LABELS: Record<string, string> = {
  client_users: "כל משתמשי הלקוח",
  agents: "סוכני מכירות",
  assignee: "המטפל בליד",
  custom: "רשימה מותאמת",
  lead: "הלקוח שפנה (הליד)",
};
const LEAD_KIND_LABELS: Record<string, string> = {
  call: "רק שיחות",
  form: "רק טפסים ודפי נחיתה",
};

export default function AutomationsManager({ clientId }: { clientId: string }) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [statuses, setStatuses] = useState<StatusOpt[]>([]);
  const [collapsed, toggleCollapse] = useCollapse("client-automations");
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([
        api<{ automations: Automation[] }>(`/api/automations?clientId=${clientId}`),
        api<{ statuses: StatusOpt[] }>(`/api/statuses?clientId=${clientId}`),
      ]);
      setAutomations(a.automations);
      setStatuses(s.statuses);
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(a: Automation) {
    await api(`/api/automations/${a.id}`, { method: "PATCH", json: { active: !a.active } });
    load();
  }

  async function remove(id: string) {
    if (!confirm("למחוק את האוטומציה?")) return;
    await api(`/api/automations/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800">הודעות אוטומטיות</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            ליד חדש (כולל שיחת טלפון) או שינוי סטטוס ⟵ הודעה אוטומטית — לצוות, או
            ללקוח הפונה עצמו (וואטסאפ עם וידאו/תמונה מהמופע הייעודי של הלקוח).
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Icon name="plus" className="h-4 w-4" />
            אוטומציה
          </Button>
          <CollapseBtn collapsed={collapsed} onClick={toggleCollapse} />
        </div>
      </div>

      {collapsed ? null : (<>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-col gap-2">
        {automations.map((a) => (
          <div key={a.id} className={`flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 ${a.active ? "" : "opacity-50"}`}>
            <Icon name="megaphone" className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-medium text-slate-700">{a.name}</span>
            <Chip color="#818cf8">
              {a.trigger === "lead_created" ? "ליד חדש" : `סטטוס: ${a.status?.name ?? "?"}`}
            </Chip>
            <Chip color="#22d3ee">{CHANNEL_LABELS[a.channel]}</Chip>
            <span className="text-xs text-slate-500">{RECIPIENT_LABELS[a.recipientType]}</span>
            {a.leadKind ? <Chip color="#f59e0b">{LEAD_KIND_LABELS[a.leadKind]}</Chip> : null}
            {a.mediaKey ? (
              <Chip color="#a78bfa">🎬 {a.mediaName ?? "מדיה מצורפת"}</Chip>
            ) : null}
            {a.cooldownHours ? (
              <span className="text-[11px] text-slate-400" title="לא נשלח שוב לאותו נמען בתוך החלון">
                קירור {a.cooldownHours} שע׳
              </span>
            ) : null}
            <div className="mr-auto flex gap-1">
              <button onClick={() => toggle(a)} className="rounded p-1.5 text-slate-500 hover:text-amber-700" title={a.active ? "כיבוי" : "הפעלה"}>
                <Icon name={a.active ? "x" : "check"} className="h-4 w-4" />
              </button>
              <button onClick={() => remove(a.id)} className="rounded p-1.5 text-slate-500 hover:text-red-600" title="מחיקה">
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {automations.length === 0 ? (
          <p className="text-xs text-slate-600">
            אין אוטומציות. דוגמה: &quot;ליד חדש ⟵ וואטסאפ לסוכן: ליד חדש {"{{name}}"} {"{{phone}}"}&quot;
          </p>
        ) : null}
      </div>
      </>)}

      {showCreate ? (
        <AutomationModal
          clientId={clientId}
          statuses={statuses}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
        />
      ) : null}
    </Card>
  );
}

function AutomationModal({
  clientId,
  statuses,
  onClose,
  onSaved,
}: {
  clientId: string;
  statuses: StatusOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    trigger: "lead_created",
    statusId: "",
    channel: "email",
    recipientType: "client_users",
    customRecipients: "",
    template: "ליד חדש: {{name}} · {{phone}}\nקמפיין: {{campaign}}",
    leadKind: "",
    cooldownHours: "",
  });
  const [media, setMedia] = useState<{ key: string; name: string; mime: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // העלאת מדיה (וידאו/תמונה) לצירוף להודעת הוואטסאפ: קטן דרך ה-API,
  // גדול (וידאו, עד 100MB) ישירות ל-R2 עם presign — עוקף את מגבלת Vercel.
  async function uploadMedia(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      if (file.size > 3_500_000) {
        const pres = await api<{ target: { url: string; headers: Record<string, string> }; key: string }>(
          "/api/uploads/presign",
          {
            method: "POST",
            json: {
              clientId,
              category: "automation",
              fileName: file.name,
              mimeType: file.type || "application/octet-stream",
              size: file.size,
            },
          }
        );
        const put = await fetch(pres.target.url, { method: "PUT", headers: pres.target.headers, body: file });
        if (!put.ok) throw new Error(`העלאת "${file.name}" נכשלה`);
        setMedia({ key: pres.key, name: file.name, mime: file.type || "application/octet-stream" });
      } else {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", "automation");
        fd.append("clientId", clientId);
        const up = await fetch("/api/uploads/direct", { method: "POST", body: fd });
        const uj = await up.json();
        if (!up.ok) throw new Error(uj.error || `העלאת "${file.name}" נכשלה`);
        setMedia({ key: uj.key, name: uj.fileName || file.name, mime: uj.mimeType || file.type });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }
  const [savedTemplates, setSavedTemplates] = useState<
    { id: string; name: string; body: string }[]
  >([]);

  useEffect(() => {
    api<{ templates: { id: string; name: string; body: string }[] }>(
      `/api/templates?clientId=${clientId}`
    )
      .then((d) => setSavedTemplates(d.templates))
      .catch(() => {});
  }, [clientId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/automations", {
        method: "POST",
        json: {
          clientId,
          name: form.name,
          trigger: form.trigger,
          statusId: form.trigger === "status_changed" ? form.statusId : null,
          channel: form.channel,
          recipientType: form.recipientType,
          customRecipients:
            form.recipientType === "custom"
              ? form.customRecipients.split(",").map((s) => s.trim()).filter(Boolean)
              : undefined,
          template: form.template,
          leadKind: form.trigger === "lead_created" && form.leadKind ? form.leadKind : null,
          mediaKey: form.channel === "whatsapp" && media ? media.key : null,
          mediaName: form.channel === "whatsapp" && media ? media.name : null,
          mediaMime: form.channel === "whatsapp" && media ? media.mime : null,
          cooldownHours: form.cooldownHours ? Number(form.cooldownHours) : null,
        },
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="אוטומציה חדשה" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Field label="שם">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder='"עדכון סוכן על ליד חדש"' required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="מתי?">
            <Select value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })}>
              <option value="lead_created">ליד חדש נכנס</option>
              <option value="status_changed">ליד עבר לסטטוס…</option>
            </Select>
          </Field>
          {form.trigger === "status_changed" ? (
            <Field label="סטטוס מפעיל">
              <Select value={form.statusId} onChange={(e) => setForm({ ...form, statusId: e.target.value })} required>
                <option value="">בחרו…</option>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <div />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ערוץ">
            <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              <option value="email">אימייל</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">וואטסאפ</option>
            </Select>
          </Field>
          <Field label="נמענים">
            <Select value={form.recipientType} onChange={(e) => setForm({ ...form, recipientType: e.target.value })}>
              <option value="client_users">כל משתמשי הלקוח</option>
              <option value="agents">סוכני מכירות בלבד</option>
              <option value="assignee">המטפל בליד</option>
              <option value="lead">הלקוח שפנה (הליד עצמו)</option>
              <option value="custom">רשימה מותאמת</option>
            </Select>
          </Field>
        </div>
        {form.trigger === "lead_created" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="אילו לידים?">
              <Select value={form.leadKind} onChange={(e) => setForm({ ...form, leadKind: e.target.value })}>
                <option value="">כל הלידים</option>
                <option value="call">רק שיחות טלפון</option>
                <option value="form">רק טפסים ודפי נחיתה</option>
              </Select>
            </Field>
            {form.recipientType === "lead" ? (
              <Field label="קירור (שעות)" hint="לא לשלוח שוב לאותו מספר בתוך X שעות. מומלץ: 72">
                <Input
                  type="number"
                  min={1}
                  max={720}
                  dir="ltr"
                  value={form.cooldownHours}
                  onChange={(e) => setForm({ ...form, cooldownHours: e.target.value })}
                  placeholder="72"
                />
              </Field>
            ) : (
              <div />
            )}
          </div>
        ) : null}
        {form.recipientType === "lead" && form.channel === "whatsapp" ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            הודעות ללקוח הפונה נשלחות מהמופע הייעודי של הלקוח (הגדרות לקוח ⟵ אינטגרציות ⟵
            וואטסאפ ייעודי) — לא מהמספר של הסוכנות. אם לא חובר מופע, ההודעה לא תישלח.
          </p>
        ) : null}
        {form.channel === "whatsapp" ? (
          <Field label="מדיה מצורפת (וידאו/תמונה)" hint="נשלח כקובץ אחד עם תוכן ההודעה ככיתוב. עד 100MB.">
            {media ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span>🎬</span>
                <span className="truncate text-slate-700">{media.name}</span>
                <button
                  type="button"
                  onClick={() => setMedia(null)}
                  className="mr-auto text-xs text-red-500 hover:underline"
                >
                  הסרה
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="video/*,image/*"
                disabled={uploading}
                onChange={(e) => uploadMedia(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-600 file:ml-3 file:rounded-lg file:border-0 file:bg-[#3a5bd9] file:px-3 file:py-1.5 file:text-sm file:text-white"
              />
            )}
            {uploading ? <p className="mt-1 text-xs text-slate-500">מעלה… נא להמתין</p> : null}
          </Field>
        ) : null}
        {form.recipientType === "custom" ? (
          <Field label="נמענים (מופרדים בפסיק)" hint="אימיילים לערוץ אימייל, טלפונים ל-SMS/וואטסאפ">
            <Input dir="ltr" value={form.customRecipients} onChange={(e) => setForm({ ...form, customRecipients: e.target.value })} />
          </Field>
        ) : null}
        {savedTemplates.length > 0 ? (
          <Field label="טעינת תבנית שמורה">
            <Select
              defaultValue=""
              onChange={(e) => {
                const t = savedTemplates.find((x) => x.id === e.target.value);
                if (t) setForm({ ...form, template: t.body });
                e.target.value = "";
              }}
            >
              <option value="">בחרו תבנית…</option>
              {savedTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field
          label="תוכן ההודעה"
          hint="משתנים: {{name}} {{phone}} {{email}} {{number}} {{status}} {{campaign}} {{client}} {{channel}} {{assignee}}"
        >
          <Textarea value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} required />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy || uploading}>{busy ? "שומר…" : "יצירה"}</Button>
        </div>
      </form>
    </Modal>
  );
}
