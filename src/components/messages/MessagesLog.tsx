"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Chip, EmptyState, Field, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface MessageRow {
  id: string;
  channel: string;
  to: string;
  subject: string | null;
  body: string;
  kind: string;
  status: string;
  error: string | null;
  createdAt: string;
  client: { name: string; color: string | null } | null;
  lead: { fullName: string | null; number: number } | null;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  sent: { label: "נשלחה", color: "#34d399" },
  skipped: { label: "ממתינה לחיבור ספק", color: "#fbbf24" },
  failed: { label: "נכשלה", color: "#f87171" },
  pending: { label: "בתור", color: "#38bdf8" },
};
const KIND_LABELS: Record<string, string> = {
  reminder: "תזכורת",
  automation: "אוטומציה",
  broadcast: "תפוצה",
  system: "מערכת",
};
const CHANNEL_LABELS: Record<string, string> = {
  email: "אימייל",
  sms: "SMS",
  whatsapp: "וואטסאפ",
};

export default function MessagesLog({
  clients = [],
}: {
  clients?: { id: string; name: string }[];
}) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ clientId: "", kind: "", channel: "", status: "" });
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ page: String(page) });
      Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
      const d = await api<{ messages: MessageRow[]; total: number }>(`/api/messages?${p}`);
      setMessages(d.messages);
      setTotal(d.total);
    } catch (e: any) {
      setError(e.message);
    }
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="glass flex flex-wrap items-end gap-3 rounded-2xl p-4">
        {clients.length > 0 ? (
          <div className="w-44">
            <Field label="לקוח">
              <Select value={filters.clientId} onChange={(e) => { setFilters({ ...filters, clientId: e.target.value }); setPage(1); }}>
                <option value="">הכול</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}
        <div className="w-36">
          <Field label="סוג">
            <Select value={filters.kind} onChange={(e) => { setFilters({ ...filters, kind: e.target.value }); setPage(1); }}>
              <option value="">הכול</option>
              {Object.entries(KIND_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-32">
          <Field label="ערוץ">
            <Select value={filters.channel} onChange={(e) => { setFilters({ ...filters, channel: e.target.value }); setPage(1); }}>
              <option value="">הכול</option>
              {Object.entries(CHANNEL_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-40">
          <Field label="סטטוס">
            <Select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}>
              <option value="">הכול</option>
              {Object.entries(STATUS_META).map(([v, m]) => (
                <option key={v} value={v}>{m.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <span className="mr-auto text-xs text-slate-500">{total} הודעות</span>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {messages.length === 0 ? (
        <div className="glass rounded-2xl p-2">
          <EmptyState icon="mail" title="אין הודעות ביומן" />
        </div>
      ) : (
        <div className="glass flex flex-col divide-y divide-slate-800/60 rounded-2xl p-2">
          {messages.map((m) => (
            <button
              key={m.id}
              onClick={() => setExpanded(expanded === m.id ? null : m.id)}
              className="flex flex-col gap-1 px-3 py-2.5 text-right transition hover:bg-slate-800/30"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Icon
                  name={m.channel === "email" ? "mail" : m.channel === "whatsapp" ? "whatsapp" : "phone"}
                  className="h-4 w-4 text-slate-500"
                />
                <span dir="ltr" className="text-xs text-slate-300">{m.to}</span>
                <Chip color={STATUS_META[m.status]?.color ?? "#64748b"}>
                  {STATUS_META[m.status]?.label ?? m.status}
                </Chip>
                <span className="text-xs text-slate-500">{KIND_LABELS[m.kind] ?? m.kind}</span>
                {m.client ? <Chip color={m.client.color ?? "#64748b"}>{m.client.name}</Chip> : null}
                {m.lead ? (
                  <span className="text-xs text-slate-500">ליד #{m.lead.number}</span>
                ) : null}
                <span className="mr-auto text-[11px] text-slate-600">{formatDateTime(m.createdAt)}</span>
              </div>
              {expanded === m.id ? (
                <div className="mt-1 whitespace-pre-line rounded-lg bg-slate-950/60 p-3 text-xs text-slate-300">
                  {m.subject ? <p className="mb-1 font-bold">{m.subject}</p> : null}
                  {m.body}
                  {m.error ? <p className="mt-2 text-red-400">שגיאה: {m.error}</p> : null}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {total > 50 ? (
        <div className="flex justify-center gap-2">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>הקודם</Button>
          <Button variant="ghost" size="sm" disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)}>הבא</Button>
        </div>
      ) : null}
    </div>
  );
}
