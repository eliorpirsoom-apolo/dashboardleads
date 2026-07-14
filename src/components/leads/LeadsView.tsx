"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { channelLabel, CHANNELS } from "@/lib/defaults";
import { Button, Chip, EmptyState, Field, Input, Select, TableShell } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";
import LeadDrawer from "./LeadDrawer";

export interface StatusOpt {
  id: string;
  name: string;
  color: string;
  systemKind: string;
}

interface LeadRow {
  id: string;
  number: number;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  channel: string | null;
  platform: string | null;
  kind: string;
  consent: boolean;
  receivedAt: string;
  audience: string | null;
  adName: string | null;
  campaignLabel: string | null;
  status: StatusOpt | null;
  campaign: { id: string; name: string } | null;
  unitType: { id: string; name: string } | null;
  _count: { notes: number };
}

export default function LeadsView({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [statuses, setStatuses] = useState<StatusOpt[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);

  const [q, setQ] = useState("");
  const [statusId, setStatusId] = useState("");
  const [channel, setChannel] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams({ clientId, page: String(page) });
    if (q) p.set("q", q);
    if (statusId) p.set("statusId", statusId);
    if (channel) p.set("channel", channel);
    if (campaignId) p.set("campaignId", campaignId);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p;
  }, [clientId, page, q, statusId, channel, campaignId, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ rows: LeadRow[]; total: number }>(
        `/api/leads?${params}`
      );
      setRows(data.rows);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<{ statuses: StatusOpt[] }>(`/api/statuses?clientId=${clientId}`)
      .then((d) => setStatuses(d.statuses))
      .catch(() => {});
    api<{ campaigns: { id: string; name: string }[] }>(
      `/api/campaigns?clientId=${clientId}`
    )
      .then((d) => setCampaigns(d.campaigns))
      .catch(() => {});
  }, [clientId]);

  async function quickStatus(leadId: string, newStatusId: string) {
    try {
      await api(`/api/leads/${leadId}`, {
        method: "PATCH",
        json: { statusId: newStatusId },
      });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="glass flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div className="min-w-[180px] flex-1">
          <Field label="חיפוש">
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="שם, טלפון, אימייל, מס׳ ליד…"
            />
          </Field>
        </div>
        <div className="w-36">
          <Field label="סטטוס">
            <Select value={statusId} onChange={(e) => { setStatusId(e.target.value); setPage(1); }}>
              <option value="">הכול</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-32">
          <Field label="ערוץ">
            <Select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }}>
              <option value="">הכול</option>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-40">
          <Field label="קמפיין">
            <Select value={campaignId} onChange={(e) => { setCampaignId(e.target.value); setPage(1); }}>
              <option value="">הכול</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-36">
          <Field label="מתאריך">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </Field>
        </div>
        <div className="w-36">
          <Field label="עד תאריך">
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </Field>
        </div>
        <div className="mr-auto flex gap-2">
          <a href={`/api/leads/export?${params}`} download>
            <Button variant="ghost" type="button">
              <Icon name="download" className="h-4 w-4" />
              ייצוא
            </Button>
          </a>
          <Button onClick={() => setShowCreate(true)}>
            <Icon name="plus" className="h-4 w-4" />
            ליד חדש
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div>
      ) : null}

      {/* Table */}
      <div className="glass rounded-2xl p-2">
        {loading && rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">טוען…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="leads"
            title="אין לידים להצגה"
            hint="לידים חדשים ייכנסו אוטומטית מהקליטה הישירה, או הוסיפו ידנית."
          />
        ) : (
          <TableShell
            minWidth={860}
            headers={["#", "תאריך", "שם", "טלפון", "סטטוס", "ערוץ", "קמפיין", "הערות", ""]}
          >
            {rows.map((l) => (
              <tr
                key={l.id}
                className="cursor-pointer transition hover:bg-slate-800/40"
                onClick={() => setOpenLeadId(l.id)}
              >
                <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{l.number}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-400">
                  {formatDateTime(l.receivedAt)}
                </td>
                <td className="px-3 py-2.5 font-medium text-slate-200">
                  <span className="flex items-center gap-1.5">
                    {l.kind === "call" ? (
                      <Icon name="phone" className="h-3.5 w-3.5 text-emerald-400" />
                    ) : l.kind === "whatsapp" ? (
                      <Icon name="whatsapp" className="h-3.5 w-3.5 text-emerald-400" />
                    ) : null}
                    {l.fullName ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-300" dir="ltr">{l.phone ?? "—"}</td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={l.status?.id ?? ""}
                    onChange={(e) => quickStatus(l.id, e.target.value)}
                    className="rounded-lg border bg-transparent px-2 py-1 text-xs font-medium outline-none"
                    style={{
                      color: l.status?.color ?? "#94a3b8",
                      borderColor: `${l.status?.color ?? "#475569"}66`,
                      backgroundColor: `${l.status?.color ?? "#475569"}14`,
                    }}
                  >
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id} style={{ color: "#0f172a" }}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-400">{channelLabel(l.channel)}</td>
                <td className="max-w-[140px] truncate px-3 py-2.5 text-xs text-slate-400">
                  {l.campaign?.name ?? l.campaignLabel ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-500">
                  {l._count.notes > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="note" className="h-3.5 w-3.5" />
                      {l._count.notes}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  <Icon name="eye" className="h-4 w-4" />
                </td>
              </tr>
            ))}
          </TableShell>
        )}

        {/* Pagination */}
        {pages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-800/60 px-4 py-3 text-xs text-slate-400">
            <span>
              {total} לידים · עמוד {page} מתוך {pages}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                הקודם
              </Button>
              <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                הבא
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {openLeadId ? (
        <LeadDrawer
          leadId={openLeadId}
          statuses={statuses}
          onClose={() => setOpenLeadId(null)}
          onChanged={load}
        />
      ) : null}

      {showCreate ? (
        <CreateLeadModal
          clientId={clientId}
          campaigns={campaigns}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateLeadModal({
  clientId,
  campaigns,
  onClose,
  onCreated,
}: {
  clientId: string;
  campaigns: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    city: "",
    channel: "",
    campaignId: "",
    consent: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/leads", {
        method: "POST",
        json: { clientId, ...form, campaignId: form.campaignId || null },
      });
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="ליד חדש" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Field label="שם מלא">
          <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="טלפון">
            <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="אימייל">
            <Input dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="עיר">
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
          <Field label="ערוץ">
            <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              <option value="">—</option>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="קמפיין">
          <Select value={form.campaignId} onChange={(e) => setForm({ ...form, campaignId: e.target.value })}>
            <option value="">—</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(e) => setForm({ ...form, consent: e.target.checked })}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900"
          />
          הסכמה לדיוור
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "שומר…" : "יצירת ליד"}</Button>
        </div>
      </form>
    </Modal>
  );
}
