"use client";

/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Chip, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

interface Broadcast {
  id: string;
  name: string;
  channel: string;
  body: string;
  total: number;
  sent: number;
  failed: number;
  status: string;
  createdBy: string | null;
  createdAt: string;
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

// הודעות תפוצה + דוח הודעות תפוצה. הסכמה לדיוור נאכפת בשרת.
export default function BroadcastsView({ clientId }: { clientId: string }) {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [statuses, setStatuses] = useState<StatusOpt[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([
        api<{ broadcasts: Broadcast[] }>(`/api/broadcasts?clientId=${clientId}`),
        api<{ statuses: StatusOpt[] }>(`/api/statuses?clientId=${clientId}`),
      ]);
      setBroadcasts(b.broadcasts);
      setStatuses(s.statuses);
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}>
          <Icon name="megaphone" className="h-4 w-4" />
          תפוצה חדשה
        </Button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {broadcasts.length === 0 ? (
        <div className="glass rounded-2xl p-2">
          <EmptyState
            icon="megaphone"
            title="אין הודעות תפוצה"
            hint="שליחה מרוכזת ללידים שנתנו הסכמה לדיוור — עם דוח מסירה מלא."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {broadcasts.map((b) => (
            <Card key={b.id} className="!p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Icon name="megaphone" className="h-5 w-5 text-violet-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800">{b.name}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{b.body}</p>
                </div>
                <Chip color="#22d3ee">{CHANNEL_LABELS[b.channel]}</Chip>
                <div className="flex gap-3 text-center text-xs">
                  <div>
                    <p className="font-bold text-slate-700">{b.total}</p>
                    <p className="text-slate-500">נמענים</p>
                  </div>
                  <div>
                    <p className="font-bold text-emerald-400">{b.sent}</p>
                    <p className="text-slate-500">נשלחו</p>
                  </div>
                  <div>
                    <p className={`font-bold ${b.failed > 0 ? "text-red-600" : "text-slate-700"}`}>{b.failed}</p>
                    <p className="text-slate-500">נכשלו</p>
                  </div>
                </div>
                <span className="text-[11px] text-slate-600">
                  {formatDateTime(b.createdAt)}
                  {b.createdBy ? ` · ${b.createdBy}` : ""}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreate ? (
        <BroadcastModal
          clientId={clientId}
          statuses={statuses}
          onClose={() => setShowCreate(false)}
          onSent={() => {
            setShowCreate(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function BroadcastModal({
  clientId,
  statuses,
  onClose,
  onSent,
}: {
  clientId: string;
  statuses: StatusOpt[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    channel: "email",
    subject: "",
    body: "שלום {{name}},\n",
    statusId: "",
    fromDate: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [templates, setTemplates] = useState<
    { id: string; name: string; channel: string; subject: string | null; body: string }[]
  >([]);

  // ספירת נמענים חיה — מתעדכנת עם כל שינוי סינון/ערוץ.
  useEffect(() => {
    const p = new URLSearchParams({ clientId, channel: form.channel });
    if (form.statusId) p.set("statusId", form.statusId);
    if (form.fromDate) p.set("fromDate", form.fromDate);
    api<{ count: number }>(`/api/broadcasts/preview?${p}`)
      .then((d) => setCount(d.count))
      .catch(() => setCount(null));
  }, [clientId, form.channel, form.statusId, form.fromDate]);

  useEffect(() => {
    api<{ templates: typeof templates }>(`/api/templates?clientId=${clientId}`)
      .then((d) => setTemplates(d.templates))
      .catch(() => {});
  }, [clientId]);

  async function saveAsTemplate() {
    const name = prompt("שם התבנית:");
    if (!name) return;
    try {
      await api("/api/templates", {
        method: "POST",
        json: {
          clientId,
          name,
          channel: form.channel,
          subject: form.subject || null,
          body: form.body,
        },
      });
      const d = await api<{ templates: typeof templates }>(`/api/templates?clientId=${clientId}`);
      setTemplates(d.templates);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm("לשלוח את התפוצה עכשיו לכל הלידים התואמים (עם הסכמה לדיוור)?")) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/broadcasts", {
        method: "POST",
        json: {
          clientId,
          name: form.name,
          channel: form.channel,
          subject: form.subject || null,
          body: form.body,
          statusId: form.statusId || null,
          fromDate: form.fromDate || null,
        },
      });
      onSent();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="הודעת תפוצה חדשה" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="text-xs text-amber-700">
            נשלח אך ורק ללידים עם הסכמה לדיוור ✓ (מייל כולל קישור הסרה אוטומטי)
          </span>
          <span className="text-sm font-bold text-amber-800">
            {count === null ? "…" : `${count} נמענים`}
          </span>
        </div>

        {templates.length > 0 ? (
          <Field label="טעינת תבנית שמורה">
            <Select
              defaultValue=""
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                if (t) {
                  setForm({
                    ...form,
                    channel: t.channel,
                    subject: t.subject ?? "",
                    body: t.body,
                  });
                }
                e.target.value = "";
              }}
            >
              <option value="">בחרו תבנית…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="שם התפוצה (פנימי)">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder='"עדכון חודשי — יולי"' required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="ערוץ">
            <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              <option value="email">אימייל</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">וואטסאפ</option>
            </Select>
          </Field>
          <Field label="סינון לפי סטטוס (אופציונלי)">
            <Select value={form.statusId} onChange={(e) => setForm({ ...form, statusId: e.target.value })}>
              <option value="">כל הסטטוסים</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="לידים מתאריך (אופציונלי)">
          <Input type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} />
        </Field>

        {form.channel === "email" ? (
          <Field label="נושא">
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </Field>
        ) : null}

        <Field label="תוכן ההודעה" hint="משתנים: {{name}} {{phone}} {{status}}">
          <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
        </Field>

        <div className="mt-2 flex justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={saveAsTemplate}>
            שמור כתבנית
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
            <Button type="submit" disabled={busy || count === 0}>
              {busy ? "שולח…" : count ? `שליחה ל-${count} נמענים` : "שליחת התפוצה"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
