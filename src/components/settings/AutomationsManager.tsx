"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { Button, Card, Chip, Field, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

interface Automation {
  id: string;
  name: string;
  trigger: string;
  channel: string;
  recipientType: string;
  customRecipients: string | null;
  template: string;
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
  custom: "רשימה מותאמת",
};

export default function AutomationsManager({ clientId }: { clientId: string }) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [statuses, setStatuses] = useState<StatusOpt[]>([]);
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
          <h3 className="text-base font-bold text-slate-100">הודעות אוטומטיות</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            ליד חדש או שינוי סטטוס ⟵ הודעה אוטומטית ללקוח או לסוכני המכירות.
            SMS/וואטסאפ נשלחים בפועל אחרי חיבור ספק (עד אז נרשמים ביומן).
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Icon name="plus" className="h-4 w-4" />
          אוטומציה
        </Button>
      </div>

      {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}

      <div className="flex flex-col gap-2">
        {automations.map((a) => (
          <div key={a.id} className={`flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 ${a.active ? "" : "opacity-50"}`}>
            <Icon name="megaphone" className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-medium text-slate-200">{a.name}</span>
            <Chip color="#818cf8">
              {a.trigger === "lead_created" ? "ליד חדש" : `סטטוס: ${a.status?.name ?? "?"}`}
            </Chip>
            <Chip color="#22d3ee">{CHANNEL_LABELS[a.channel]}</Chip>
            <span className="text-xs text-slate-500">{RECIPIENT_LABELS[a.recipientType]}</span>
            <div className="mr-auto flex gap-1">
              <button onClick={() => toggle(a)} className="rounded p-1.5 text-slate-500 hover:text-amber-300" title={a.active ? "כיבוי" : "הפעלה"}>
                <Icon name={a.active ? "x" : "check"} className="h-4 w-4" />
              </button>
              <button onClick={() => remove(a.id)} className="rounded p-1.5 text-slate-500 hover:text-red-400" title="מחיקה">
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
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
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
              <option value="custom">רשימה מותאמת</option>
            </Select>
          </Field>
        </div>
        {form.recipientType === "custom" ? (
          <Field label="נמענים (מופרדים בפסיק)" hint="אימיילים לערוץ אימייל, טלפונים ל-SMS/וואטסאפ">
            <Input dir="ltr" value={form.customRecipients} onChange={(e) => setForm({ ...form, customRecipients: e.target.value })} />
          </Field>
        ) : null}
        <Field
          label="תוכן ההודעה"
          hint="משתנים: {{name}} {{phone}} {{email}} {{number}} {{status}} {{campaign}} {{client}} {{channel}}"
        >
          <Textarea value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} required />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "שומר…" : "יצירה"}</Button>
        </div>
      </form>
    </Modal>
  );
}
