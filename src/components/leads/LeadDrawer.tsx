"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime, formatDuration } from "@/lib/format";
import { CHANNELS } from "@/lib/defaults";
import { Button, Chip, Field, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { StatusOpt } from "./LeadsView";

interface CustomField {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  options: string | null;
}

interface ProjectOpt {
  id: string;
  name: string;
  units: { id: string; name: string; available: number }[];
}

interface FullLead {
  id: string;
  clientId: string;
  number: number;
  kind: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  channel: string | null;
  platform: string | null;
  audience: string | null;
  adName: string | null;
  campaignLabel: string | null;
  consent: boolean;
  receivedAt: string;
  data: string | null;
  statusId: string | null;
  unitTypeId: string | null;
  projectId: string | null;
  callDurationSec: number | null;
  callRecordingUrl: string | null;
  callStatus: string | null;
  status: StatusOpt | null;
  campaign: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  unitType: { id: string; name: string } | null;
  source: { id: string; name: string } | null;
  notes: { id: string; authorName: string; body: string; createdAt: string }[];
  tasks: { id: string; title: string; dueAt: string; type: string }[];
  contracts: { id: string; value: number; signedAt: string | null }[];
}

export default function LeadDrawer({
  leadId,
  statuses,
  onClose,
  onChanged,
}: {
  leadId: string;
  statuses: StatusOpt[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [lead, setLead] = useState<FullLead | null>(null);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [edit, setEdit] = useState<Record<string, any>>({});
  const [customEdit, setCustomEdit] = useState<Record<string, any>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ lead: FullLead; customFields: CustomField[] }>(
        `/api/leads/${leadId}`
      );
      setLead(d.lead);
      setFields(d.customFields);
      setEdit({});
      setCustomEdit({});
      // Real-estate: offer unit-type linking (empty for other client types).
      api<{ projects: ProjectOpt[] }>(`/api/projects?clientId=${d.lead.clientId}`)
        .then((p) => setProjects(p.projects))
        .catch(() => {});
    } catch (e: any) {
      setError(e.message);
    }
  }, [leadId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty = Object.keys(edit).length > 0 || Object.keys(customEdit).length > 0;

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/leads/${leadId}`, {
        method: "PATCH",
        json: {
          ...edit,
          ...(Object.keys(customEdit).length ? { data: customEdit } : {}),
        },
      });
      await load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api(`/api/leads/${leadId}/notes`, { method: "POST", json: { body: note } });
      setNote("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!confirm("להעביר את הליד לארכיון?")) return;
    await api(`/api/leads/${leadId}`, { method: "DELETE" });
    onChanged();
    onClose();
  }

  const data = lead?.data ? JSON.parse(lead.data) : {};
  const val = (k: keyof FullLead) =>
    edit[k] !== undefined ? edit[k] : lead?.[k] ?? "";

  return (
    <div className="fixed inset-0 z-50 flex justify-start">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="thin-scroll relative h-full w-full max-w-xl overflow-y-auto border-l border-slate-800 bg-[#0a0f1d] p-6 shadow-2xl">
        {!lead ? (
          <p className="text-sm text-slate-500">{error || "טוען…"}</p>
        ) : (
          <>
            {/* Header */}
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500">
                  ליד #{lead.number} · {formatDateTime(lead.receivedAt)}
                  {lead.source ? ` · ${lead.source.name}` : ""}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-100">
                  {lead.fullName ?? "ללא שם"}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {lead.status ? (
                    <Chip color={lead.status.color}>{lead.status.name}</Chip>
                  ) : null}
                  {lead.kind === "call" ? (
                    <Chip color="#34d399">ליד טלפוני</Chip>
                  ) : null}
                  {lead.consent ? <Chip color="#38bdf8">הסכמה לדיוור</Chip> : null}
                  {lead.contracts.length > 0 ? (
                    <Chip color="#fbbf24">חוזה חתום</Chip>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={archive}
                  title="ארכיון"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-red-400"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                >
                  <Icon name="x" className="h-4 w-4" />
                </button>
              </div>
            </div>

            {error ? (
              <div className="mb-3 rounded-xl border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div>
            ) : null}

            {/* Call lead info */}
            {lead.kind === "call" ? (
              <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-3 text-center text-xs">
                <div>
                  <p className="text-slate-500">משך שיחה</p>
                  <p className="mt-0.5 font-bold text-emerald-300">{formatDuration(lead.callDurationSec)}</p>
                </div>
                <div>
                  <p className="text-slate-500">סטטוס שיחה</p>
                  <p className="mt-0.5 font-bold text-emerald-300">{lead.callStatus ?? "—"}</p>
                </div>
                <div>
                  <p className="text-slate-500">הקלטה</p>
                  {lead.callRecordingUrl ? (
                    <a href={lead.callRecordingUrl} target="_blank" className="mt-0.5 block font-bold text-cyan-300 underline">האזנה</a>
                  ) : (
                    <p className="mt-0.5 font-bold text-slate-500">—</p>
                  )}
                </div>
              </div>
            ) : null}

            {/* Details form */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="סטטוס">
                <Select
                  value={edit.statusId !== undefined ? edit.statusId : lead.statusId ?? ""}
                  onChange={(e) => setEdit({ ...edit, statusId: e.target.value })}
                >
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="שם מלא">
                <Input value={val("fullName") as string} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} />
              </Field>
              <Field label="טלפון">
                <Input dir="ltr" value={val("phone") as string} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              </Field>
              <Field label="אימייל">
                <Input dir="ltr" value={val("email") as string} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </Field>
              <Field label="עיר">
                <Input value={val("city") as string} onChange={(e) => setEdit({ ...edit, city: e.target.value })} />
              </Field>
              <Field label="ערוץ">
                <Select
                  value={edit.channel !== undefined ? edit.channel : lead.channel ?? ""}
                  onChange={(e) => setEdit({ ...edit, channel: e.target.value })}
                >
                  <option value="">—</option>
                  {CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="קהל">
                <Input value={val("audience") as string} onChange={(e) => setEdit({ ...edit, audience: e.target.value })} />
              </Field>
              <Field label="מודעה">
                <Input value={val("adName") as string} onChange={(e) => setEdit({ ...edit, adName: e.target.value })} />
              </Field>
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={edit.consent !== undefined ? edit.consent : lead.consent}
                onChange={(e) => setEdit({ ...edit, consent: e.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              />
              הסכמה לדיוור
            </label>

            {/* Real-estate: unit linking + purchase request */}
            {projects.length > 0 ? (
              <div className="mt-4 rounded-xl border border-cyan-900/40 bg-cyan-950/20 p-3">
                <p className="mb-2 text-xs font-bold text-cyan-300">שיוך לפרויקט ודירה</p>
                <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                  <Field label="טיפוס דירה" hint='מעבר לסטטוס "עסקה" יוריד את הדירה מהמלאי'>
                    <Select
                      value={
                        edit.unitTypeId !== undefined
                          ? edit.unitTypeId ?? ""
                          : lead.unitTypeId ?? ""
                      }
                      onChange={(e) => {
                        const unitId = e.target.value || null;
                        const proj = projects.find((p) =>
                          p.units.some((u) => u.id === unitId)
                        );
                        setEdit({
                          ...edit,
                          unitTypeId: unitId,
                          projectId: proj?.id ?? lead.projectId,
                        });
                      }}
                    >
                      <option value="">—</option>
                      {projects.map((p) => (
                        <optgroup key={p.id} label={p.name}>
                          {p.units.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.available} זמינות)
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        setBusy(true);
                        await api("/api/purchase-requests", {
                          method: "POST",
                          json: {
                            clientId: lead.clientId,
                            leadId: lead.id,
                            projectId:
                              edit.projectId ?? lead.projectId ?? projects[0]?.id ?? null,
                            unitTypeId: edit.unitTypeId ?? lead.unitTypeId ?? null,
                          },
                        });
                        alert("בקשת רכישה נפתחה ✓");
                      } catch (e: any) {
                        setError(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Icon name="money" className="h-3.5 w-3.5" />
                    בקשת רכישה
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Custom fields */}
            {fields.length > 0 ? (
              <>
                <h3 className="mb-2 mt-5 text-sm font-bold text-slate-300">שדות מותאמים</h3>
                <div className="grid grid-cols-2 gap-3">
                  {fields.map((f) => {
                    const current =
                      customEdit[f.key] !== undefined ? customEdit[f.key] : data[f.key];
                    if (f.fieldType === "boolean") {
                      return (
                        <label key={f.id} className="flex items-center gap-2 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={Boolean(current)}
                            onChange={(e) => setCustomEdit({ ...customEdit, [f.key]: e.target.checked })}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                          />
                          {f.label}
                        </label>
                      );
                    }
                    if (f.fieldType === "select") {
                      const opts: string[] = f.options ? JSON.parse(f.options) : [];
                      return (
                        <Field key={f.id} label={f.label}>
                          <Select
                            value={current ?? ""}
                            onChange={(e) => setCustomEdit({ ...customEdit, [f.key]: e.target.value })}
                          >
                            <option value="">—</option>
                            {opts.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </Select>
                        </Field>
                      );
                    }
                    return (
                      <Field key={f.id} label={f.label}>
                        <Input
                          type={f.fieldType === "number" ? "number" : f.fieldType === "date" ? "date" : "text"}
                          value={current ?? ""}
                          onChange={(e) => setCustomEdit({ ...customEdit, [f.key]: e.target.value })}
                        />
                      </Field>
                    );
                  })}
                </div>
              </>
            ) : null}

            {dirty ? (
              <div className="sticky bottom-0 mt-4 flex justify-end gap-2 rounded-xl bg-[#0a0f1d]/95 py-2">
                <Button variant="ghost" onClick={() => { setEdit({}); setCustomEdit({}); }}>ביטול</Button>
                <Button onClick={save} disabled={busy}>{busy ? "שומר…" : "שמירת שינויים"}</Button>
              </div>
            ) : null}

            {/* Open tasks linked to this lead */}
            {lead.tasks.length > 0 ? (
              <>
                <h3 className="mb-2 mt-6 text-sm font-bold text-slate-300">משימות פתוחות</h3>
                <div className="flex flex-col gap-1.5">
                  {lead.tasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300">
                      <Icon name={t.type === "meeting" ? "calendar" : "tasks"} className="h-3.5 w-3.5 text-cyan-400" />
                      {t.title}
                      <span className="mr-auto text-slate-500">{formatDateTime(t.dueAt)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {/* Notes timeline */}
            <h3 className="mb-2 mt-6 text-sm font-bold text-slate-300">
              הערות ({lead.notes.length})
            </h3>
            <form onSubmit={addNote} className="mb-3 flex gap-2">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="כתבו הערה…"
              />
              <Button type="submit" disabled={busy || !note.trim()} size="sm">
                הוספה
              </Button>
            </form>
            <div className="flex flex-col gap-2">
              {lead.notes.map((n) => (
                <div key={n.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium text-slate-400">{n.authorName}</span>
                    <span>{formatDateTime(n.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-line text-sm text-slate-200">{n.body}</p>
                </div>
              ))}
              {lead.notes.length === 0 ? (
                <p className="text-xs text-slate-600">אין הערות עדיין.</p>
              ) : null}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
