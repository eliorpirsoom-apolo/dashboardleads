"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { channelLabel, CHANNELS } from "@/lib/defaults";
import { Button, EmptyState, Field, Input, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";
import { fireConfetti } from "@/lib/confetti";
import LeadDrawer from "./LeadDrawer";
import ImportLeadsModal from "./ImportLeadsModal";

export interface StatusOpt {
  id: string;
  name: string;
  color: string;
  systemKind: string;
}

export interface UserOpt {
  id: string;
  name: string;
  isAgent: boolean;
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
  archived: boolean;
  receivedAt: string;
  audience: string | null;
  adName: string | null;
  campaignLabel: string | null;
  status: StatusOpt | null;
  campaign: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  unitType: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
  callStatus: string | null;
  callDurationSec: number | null;
  _count: { notes: number };
}

// סטטוס שיחת טלפון → תווית + צבע לתצוגה בטבלה (עברית או ערך גולמי מ-CheckCall).
// מספר ישראלי → פורמט בינלאומי לקישורי wa.me / tel (972 בלי 0 מוביל).
function phoneIntl(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

function callStatusStyle(raw: string | null): { label: string; color: string } | null {
  if (!raw) return null;
  const s = raw.trim();
  const he: Record<string, string> = {
    "נענתה": "#10b981",
    "לא נענתה": "#ef4444",
    "בוטלה": "#94a3b8",
    "תפוס": "#f59e0b",
  };
  if (he[s]) return { label: s, color: he[s] };
  const rawMap: Record<string, { label: string; color: string }> = {
    ANSWER: { label: "נענתה", color: "#10b981" },
    NOANSWER: { label: "לא נענתה", color: "#ef4444" },
    BUSY: { label: "תפוס", color: "#f59e0b" },
    CANCEL: { label: "בוטלה", color: "#94a3b8" },
    CHANUNAVAIL: { label: "לא זמין", color: "#94a3b8" },
    CONGESTION: { label: "לא זמין", color: "#94a3b8" },
  };
  return rawMap[s.toUpperCase()] ?? { label: s, color: "#64748b" };
}

function fmtCallDur(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function LeadsView({
  clientId,
  canImport = false,
}: {
  clientId: string;
  canImport?: boolean;
}) {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [statuses, setStatuses] = useState<StatusOpt[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const [q, setQ] = useState("");
  const [statusId, setStatusId] = useState("");
  const [channel, setChannel] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams({ clientId, page: String(page) });
    if (q) p.set("q", q);
    if (statusId) p.set("statusId", statusId);
    if (channel) p.set("channel", channel);
    if (campaignId) p.set("campaignId", campaignId);
    if (assigneeId) p.set("assigneeId", assigneeId);
    if (projectId) p.set("projectId", projectId);
    if (showArchived) p.set("archived", "true");
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p;
  }, [clientId, page, q, statusId, channel, campaignId, assigneeId, projectId, showArchived, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ rows: LeadRow[]; total: number }>(
        `/api/leads?${params}`
      );
      setRows(data.rows);
      setTotal(data.total);
      setSelected(new Set());
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
    api<{ users: UserOpt[] }>(`/api/client-users?clientId=${clientId}`)
      .then((d) => setUsers(d.users))
      .catch(() => {});
    api<{ projects: { id: string; name: string }[] }>(`/api/projects?clientId=${clientId}`)
      .then((d) => setProjects(d.projects))
      .catch(() => {});
  }, [clientId]);

  async function quickStatus(leadId: string, newStatusId: string) {
    try {
      await api(`/api/leads/${leadId}`, {
        method: "PATCH",
        json: { statusId: newStatusId },
      });
      // 🎉 עסקה נסגרה!
      if (statuses.find((s) => s.id === newStatusId)?.systemKind === "won") {
        fireConfetti();
      }
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function bulk(action: string, extra: Record<string, any> = {}) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      await api("/api/leads/bulk", {
        method: "POST",
        json: { clientId, ids: [...selected], action, ...extra },
      });
      if (
        action === "set_status" &&
        statuses.find((s) => s.id === extra.statusId)?.systemKind === "won"
      ) {
        fireConfetti();
      }
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))
    );
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="glass flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div className="min-w-[160px] flex-1">
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
        <div className="w-32">
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
          <Field label="מטפל">
            <Select value={assigneeId} onChange={(e) => { setAssigneeId(e.target.value); setPage(1); }}>
              <option value="">הכול</option>
              <option value="me">הלידים שלי</option>
              <option value="none">ללא מטפל</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-28">
          <Field label="ערוץ">
            <Select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }}>
              <option value="">הכול</option>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-36">
          <Field label="קמפיין">
            <Select value={campaignId} onChange={(e) => { setCampaignId(e.target.value); setPage(1); }}>
              <option value="">הכול</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        {projects.length > 0 ? (
          <div className="w-36">
            <Field label="פרויקט">
              <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setPage(1); }}>
                <option value="">הכול</option>
                <option value="none">ללא פרויקט</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}
        <div className="w-32">
          <Field label="מתאריך">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </Field>
        </div>
        <div className="w-32">
          <Field label="עד תאריך">
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </Field>
        </div>
        <div className="mr-auto flex flex-wrap gap-2">
          <Button
            variant="ghost"
            type="button"
            onClick={() => { setShowArchived(!showArchived); setPage(1); }}
            className={showArchived ? "!border-amber-500/60 !text-amber-700" : ""}
          >
            <Icon name="folder" className="h-4 w-4" />
            {showArchived ? "חזרה ללידים" : "ארכיון"}
          </Button>
          <a href={`/api/leads/export?${params}`} download>
            <Button variant="ghost" type="button">
              <Icon name="download" className="h-4 w-4" />
              ייצוא
            </Button>
          </a>
          {canImport ? (
            <Button variant="ghost" onClick={() => setShowImport(true)}>
              <Icon name="upload" className="h-4 w-4" />
              ייבוא Excel/CSV
            </Button>
          ) : null}
          <Button onClick={() => setShowCreate(true)}>
            <Icon name="plus" className="h-4 w-4" />
            ליד חדש
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      ) : null}

      {/* Bulk action bar */}
      {selected.size > 0 ? (
        <div className="glass sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border !border-cyan-500/40 p-3">
          <span className="text-sm font-bold text-cyan-700">{selected.size} נבחרו</span>
          <Select
            className="!w-40"
            defaultValue=""
            disabled={bulkBusy}
            onChange={(e) => {
              if (e.target.value) bulk("set_status", { statusId: e.target.value });
              e.target.value = "";
            }}
          >
            <option value="">שינוי סטטוס…</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <Select
            className="!w-40"
            defaultValue=""
            disabled={bulkBusy}
            onChange={(e) => {
              if (e.target.value) {
                bulk("assign", { assigneeId: e.target.value === "__none__" ? null : e.target.value });
              }
              e.target.value = "";
            }}
          >
            <option value="">שיוך מטפל…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
            <option value="__none__">הסרת מטפל</option>
          </Select>
          {projects.length > 0 ? (
            <Select
              className="!w-40"
              defaultValue=""
              disabled={bulkBusy}
              onChange={(e) => {
                if (e.target.value) {
                  bulk("set_project", { projectId: e.target.value === "__none__" ? null : e.target.value });
                }
                e.target.value = "";
              }}
            >
              <option value="">שיוך לפרויקט…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              <option value="__none__">הסרה מפרויקט</option>
            </Select>
          ) : null}
          {showArchived ? (
            <Button variant="ghost" size="sm" disabled={bulkBusy} onClick={() => bulk("restore")}>
              שחזור מהארכיון
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={bulkBusy}
              onClick={() => confirm(`להעביר ${selected.size} לידים לארכיון?`) && bulk("archive")}
            >
              העברה לארכיון
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            disabled={bulkBusy}
            onClick={() =>
              confirm(
                `למחוק ${selected.size} לידים לצמיתות? פעולה בלתי הפיכה — ההערות והפעילות יימחקו.`
              ) && bulk("delete")
            }
          >
            מחק לצמיתות
          </Button>
          <button onClick={() => setSelected(new Set())} className="mr-auto text-xs text-slate-500 hover:text-slate-600">
            ניקוי בחירה
          </button>
        </div>
      ) : null}

      {/* Table */}
      <div className="glass rounded-2xl p-2">
        {loading && rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">טוען…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="leads"
            title={showArchived ? "הארכיון ריק" : "אין לידים להצגה"}
            hint={showArchived ? undefined : "לידים חדשים ייכנסו אוטומטית מהקליטה הישירה, או הוסיפו ידנית."}
          />
        ) : (
          <div className="thin-scroll overflow-x-auto rounded-2xl">
            <table className="w-full text-right text-sm" style={{ minWidth: 940 }}>
              <thead>
                <tr className="border-b border-slate-300/60 text-xs text-slate-400">
                  <th className="px-2 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.size === rows.length && rows.length > 0}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-slate-600 bg-white"
                    />
                  </th>
                  {["#", "תאריך", "שם", "טלפון", "סטטוס", "מטפל", "פרויקט", "ערוץ", "קמפיין", "הערות", ""].map((h, i) => (
                    <th key={i} className="px-3 py-2.5 text-right font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((l) => (
              <tr
                key={l.id}
                className={`cursor-pointer transition hover:bg-slate-100/40 ${l.archived ? "opacity-60" : ""}`}
                onClick={() => setOpenLeadId(l.id)}
              >
                <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(l.id)}
                    onChange={() => toggleOne(l.id)}
                    className="h-4 w-4 rounded border-slate-600 bg-white"
                  />
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{l.number}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-400">
                  {formatDateTime(l.receivedAt)}
                </td>
                <td className="px-3 py-2.5 font-medium text-slate-700">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {l.kind === "call" ? (
                      <Icon name="phone" className="h-3.5 w-3.5 text-emerald-400" />
                    ) : l.kind === "whatsapp" ? (
                      <Icon name="whatsapp" className="h-3.5 w-3.5 text-emerald-400" />
                    ) : null}
                    {l.fullName ?? "—"}
                    {l.kind === "call" && callStatusStyle(l.callStatus)
                      ? (() => {
                          const c = callStatusStyle(l.callStatus)!;
                          return (
                            <span
                              className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ color: c.color, backgroundColor: `${c.color}1a` }}
                            >
                              {c.label}
                              {l.callDurationSec ? ` · ${fmtCallDur(l.callDurationSec)}` : ""}
                            </span>
                          );
                        })()
                      : null}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-600" onClick={(e) => e.stopPropagation()}>
                  {l.phone ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span dir="ltr">{l.phone}</span>
                      <a
                        href={`https://wa.me/${phoneIntl(l.phone)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="פתיחת שיחת וואטסאפ"
                        className="rounded-md p-1 text-emerald-500 transition hover:bg-emerald-50 hover:text-emerald-600"
                      >
                        <Icon name="whatsapp" className="h-4 w-4" />
                      </a>
                      <a
                        href={`tel:+${phoneIntl(l.phone)}`}
                        title="חיוג"
                        className="rounded-md p-1 text-[#3a5bd9] transition hover:bg-[#3a5bd9]/10"
                      >
                        <Icon name="phone" className="h-4 w-4" />
                      </a>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
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
                <td className="px-3 py-2.5 text-xs text-slate-400">
                  {l.assignee ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-700">
                        {l.assignee.name.slice(0, 1)}
                      </span>
                      {l.assignee.name.split(" ")[0]}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {l.project ? (
                    <span className="rounded-lg bg-cyan-500/10 px-2 py-0.5 text-cyan-700">
                      {l.project.name}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="hidden px-3 py-2.5 text-xs text-slate-400 md:table-cell">{channelLabel(l.channel)}</td>
                <td className="hidden max-w-[130px] truncate px-3 py-2.5 text-xs text-slate-400 lg:table-cell">
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
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200/60 px-4 py-3 text-xs text-slate-400">
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
          users={users}
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

      {showImport ? (
        <ImportLeadsModal
          clientId={clientId}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
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
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
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
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(e) => setForm({ ...form, consent: e.target.checked })}
            className="h-4 w-4 rounded border-slate-600 bg-white"
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
