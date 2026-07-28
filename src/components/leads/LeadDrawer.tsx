"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime, formatDuration } from "@/lib/format";
import { CHANNELS } from "@/lib/defaults";
import { fireConfetti } from "@/lib/confetti";
import { Button, Chip, Field, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { StatusOpt, UserOpt } from "./LeadsView";

interface Activity {
  id: string;
  actorName: string;
  kind: string;
  fromValue: string | null;
  toValue: string | null;
  note: string | null;
  createdAt: string;
}

interface DuplicateLead {
  id: string;
  number: number;
  fullName: string | null;
  receivedAt: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  create: "הליד נוצר",
  status: "שינוי סטטוס",
  assign: "שיוך מטפל",
  project: "שיוך לפרויקט",
  archive: "הועבר לארכיון",
  restore: "שוחזר מהארכיון",
  consent: "הסרה מדיוור",
  merge: "מיזוג כפילות",
  import: "יובא מקובץ",
};

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
  archived: boolean;
  receivedAt: string;
  data: string | null;
  statusId: string | null;
  unitTypeId: string | null;
  projectId: string | null;
  assigneeId: string | null;
  assignee: { id: string; name: string } | null;
  activities: Activity[];
  callDurationSec: number | null;
  callRecordingUrl: string | null;
  callStatus: string | null;
  callAdNumber: string | null;
  callTargetNumber: string | null;
  callTargetName: string | null;
  callTranscript: string | null;
  callSummary: string | null;
  callRecordingKey: string | null;
  callTranscriptStatus: string | null;
  messages: {
    id: string;
    channel: string;
    status: string;
    kind: string;
    subject: string | null;
    createdAt: string;
  }[];
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
  users = [],
  onClose,
  onChanged,
}: {
  leadId: string;
  statuses: StatusOpt[];
  users?: UserOpt[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [lead, setLead] = useState<FullLead | null>(null);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateLead[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [edit, setEdit] = useState<Record<string, any>>({});
  const [customEdit, setCustomEdit] = useState<Record<string, any>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sched, setSched] = useState({
    type: "callback",
    dueAt: "",
    minutesBefore: "60",
    email: true,
    sms: false,
    whatsapp: false,
    toAgent: true,
    toLead: false,
  });

  const load = useCallback(async () => {
    try {
      const d = await api<{
        lead: FullLead;
        customFields: CustomField[];
        duplicates: DuplicateLead[];
      }>(`/api/leads/${leadId}`);
      setLead(d.lead);
      setFields(d.customFields);
      setDuplicates(d.duplicates ?? []);
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

  async function scheduleTask() {
    if (!lead || !sched.dueAt) return;
    const who = lead.fullName || lead.phone || "ליד";
    const title =
      sched.type === "meeting"
        ? `פגישה — ${who}`
        : sched.type === "contract"
          ? `חתימת חוזה — ${who}`
          : `לחזור ל${who}`;
    const channels = [
      sched.email ? "email" : null,
      sched.sms ? "sms" : null,
      sched.whatsapp ? "whatsapp" : null,
    ].filter(Boolean) as string[];
    const targets = [
      sched.toAgent ? "agent" : null,
      sched.toLead ? "lead" : null,
    ].filter(Boolean) as string[];
    setBusy(true);
    setError("");
    try {
      await api("/api/tasks", {
        method: "POST",
        json: {
          leadId: lead.id,
          clientId: lead.clientId,
          assigneeId: lead.assigneeId || null,
          type: sched.type,
          title,
          dueAt: new Date(sched.dueAt).toISOString(),
          durationMin: sched.type === "meeting" ? 60 : null,
          reminderChannels: channels,
          reminderMinutesBefore: Number(sched.minutesBefore) || 0,
          reminderTargets: targets.length ? targets : ["agent"],
        },
      });
      setSched((s) => ({ ...s, dueAt: "" }));
      await load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

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
      // 🎉 עסקה נסגרה!
      if (
        edit.statusId &&
        statuses.find((s) => s.id === edit.statusId)?.systemKind === "won"
      ) {
        fireConfetti();
      }
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

  async function removeForever() {
    if (
      !confirm(
        "למחוק את הליד לצמיתות? פעולה זו אינה הפיכה — ההערות והפעילות יימחקו לגמרי."
      )
    )
      return;
    await api(`/api/leads/${leadId}?hard=true`, { method: "DELETE" });
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
                  {lead.assignee ? (
                    <Chip color="#818cf8">מטפל: {lead.assignee.name}</Chip>
                  ) : null}
                  {lead.kind === "call" ? (
                    <Chip color="#34d399">ליד טלפוני</Chip>
                  ) : null}
                  {lead.consent ? <Chip color="#38bdf8">הסכמה לדיוור</Chip> : null}
                  {lead.contracts.length > 0 ? (
                    <Chip color="#fbbf24">חוזה חתום</Chip>
                  ) : null}
                  {lead.archived ? <Chip color="#f87171">בארכיון</Chip> : null}
                </div>
              </div>
              <div className="flex gap-1">
                {!lead.archived ? (
                  <button
                    onClick={archive}
                    title="העבר לארכיון"
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-amber-300"
                  >
                    <Icon name="folder" className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  onClick={removeForever}
                  title="מחק לצמיתות"
                  className="rounded-lg p-2 text-slate-500 hover:bg-rose-900/40 hover:text-rose-300"
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

            {/* Archived banner */}
            {lead.archived ? (
              <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-amber-800/50 bg-amber-950/30 px-3 py-2">
                <span className="text-sm text-amber-300">הליד נמצא בארכיון</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    await api(`/api/leads/${leadId}`, { method: "PATCH", json: { archived: false } });
                    await load();
                    onChanged();
                  }}
                >
                  שחזור
                </Button>
              </div>
            ) : null}

            {/* Duplicates alert */}
            {duplicates.length > 0 ? (
              <div className="mb-4 rounded-xl border border-orange-800/50 bg-orange-950/25 p-3">
                <p className="mb-2 text-xs font-bold text-orange-300">
                  ⚠️ נמצאו {duplicates.length} לידים נוספים עם אותו טלפון/אימייל
                </p>
                <div className="flex flex-col gap-1.5">
                  {duplicates.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 text-xs text-slate-300">
                      <span className="font-mono text-slate-500">#{d.number}</span>
                      <span>{d.fullName ?? "ללא שם"}</span>
                      <span className="text-slate-600">{formatDateTime(d.receivedAt)}</span>
                      <button
                        className="mr-auto font-bold text-cyan-400 hover:underline"
                        disabled={busy}
                        onClick={async () => {
                          if (!confirm(`למזג את ליד #${d.number} לתוך הליד הנוכחי? ההערות והמשימות יעברו לכאן והכפול יועבר לארכיון.`)) return;
                          try {
                            setBusy(true);
                            await api(`/api/leads/${leadId}/merge`, {
                              method: "POST",
                              json: { otherId: d.id },
                            });
                            await load();
                            onChanged();
                          } catch (e: any) {
                            setError(e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        מזג לכאן ←
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Call lead info */}
            {lead.kind === "call" ? (
              <div className="mb-4 space-y-3 rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-3">
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div>
                    <p className="text-slate-500">מתקשר</p>
                    <p dir="ltr" className="mt-0.5 text-right font-bold text-slate-200">{lead.phone ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">מספר פרסומי</p>
                    <p dir="ltr" className="mt-0.5 text-right font-bold text-slate-200">{lead.callAdNumber ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">יעד</p>
                    <p dir="ltr" className="mt-0.5 text-right font-bold text-slate-200">
                      {lead.callTargetNumber ?? "—"}
                      {lead.callTargetName ? ` · ${lead.callTargetName}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">משך</p>
                    <p className="mt-0.5 font-bold text-emerald-300">{formatDuration(lead.callDurationSec)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">סטטוס מענה</p>
                    <p className="mt-0.5 font-bold text-emerald-300">{lead.callStatus ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">הודעת מעקב</p>
                    {(() => {
                      const fu = (lead.messages || []).find(
                        (m) => m.channel === "sms" || m.channel === "whatsapp"
                      );
                      if (!fu) return <p className="mt-0.5 font-bold text-slate-500">לא נשלחה</p>;
                      const chan = fu.channel === "sms" ? "SMS" : "וואטסאפ";
                      const st =
                        fu.status === "sent"
                          ? "נשלחה ✓"
                          : fu.status === "failed"
                            ? "נכשלה"
                            : fu.status === "skipped"
                              ? "לא הוגדר"
                              : fu.status;
                      return (
                        <p className="mt-0.5 font-bold text-slate-200">
                          {chan}: {st}
                        </p>
                      );
                    })()}
                  </div>
                </div>

                {lead.callRecordingKey || lead.callRecordingUrl ? (
                  <div>
                    <p className="mb-1 text-xs text-slate-500">הקלטה</p>
                    <audio
                      controls
                      preload="none"
                      src={lead.callRecordingKey ? `/api/recordings/${lead.id}` : lead.callRecordingUrl!}
                      className="w-full"
                    />
                  </div>
                ) : null}

                {!lead.callTranscript &&
                (lead.callRecordingKey || lead.callRecordingUrl) &&
                lead.callTranscriptStatus !== "no_audio" &&
                lead.callTranscriptStatus !== "no_speech" ? (
                  <p className="text-[11px] text-slate-500">
                    {lead.callTranscriptStatus === "failed"
                      ? "⚠️ תמלול נכשל — ננסה שוב בריצה הבאה"
                      : lead.callTranscriptStatus === "pending"
                        ? "⏳ מתמלל את השיחה…"
                        : "⏳ התמלול והסיכום יופקו אוטומטית תוך מספר דקות"}
                  </p>
                ) : null}

                {lead.callSummary ? (
                  <div>
                    <p className="mb-1 text-xs font-bold text-slate-300">סיכום שיחה</p>
                    <div className="whitespace-pre-line rounded-lg bg-slate-900/50 p-2 text-xs text-slate-300">
                      {lead.callSummary}
                    </div>
                  </div>
                ) : null}

                {lead.callTranscript ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
                      תמלול מלא
                    </summary>
                    <div className="thin-scroll mt-1 max-h-64 overflow-y-auto whitespace-pre-line rounded-lg bg-slate-900/50 p-2 text-slate-300">
                      {lead.callTranscript}
                    </div>
                  </details>
                ) : null}
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
              <Field label="מטפל בליד">
                <Select
                  value={edit.assigneeId !== undefined ? edit.assigneeId ?? "" : lead.assigneeId ?? ""}
                  onChange={(e) => setEdit({ ...edit, assigneeId: e.target.value || null })}
                >
                  <option value="">ללא מטפל</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
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

            {/* Project linking (+ unit & purchase request for real-estate) */}
            {projects.length > 0 ? (
              <div className="mt-4 rounded-xl border border-cyan-900/40 bg-cyan-950/20 p-3">
                <p className="mb-2 text-xs font-bold text-cyan-300">שיוך לפרויקט</p>
                <Field label="פרויקט">
                  <Select
                    value={
                      edit.projectId !== undefined
                        ? edit.projectId ?? ""
                        : lead.projectId ?? ""
                    }
                    onChange={(e) =>
                      setEdit({ ...edit, projectId: e.target.value || null })
                    }
                  >
                    <option value="">ללא פרויקט</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                </Field>
                {projects.some((p) => p.units.length > 0) ? (
                <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2">
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
                ) : null}
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

            {/* Schedule a future task/reminder for this lead */}
            <h3 className="mb-2 mt-6 text-sm font-bold text-slate-300">תזמון משימה ותזכורת</h3>
            <div className="flex flex-col gap-2.5 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { v: "callback", l: "לחזור לליד", icon: "phone" },
                  { v: "meeting", l: "פגישה", icon: "calendar" },
                  { v: "contract", l: "תאריך חוזה", icon: "doc" },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setSched({ ...sched, type: o.v })}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                      sched.type === o.v
                        ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40"
                        : "bg-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Icon name={o.icon} className="h-3.5 w-3.5" />
                    {o.l}
                  </button>
                ))}
              </div>
              <Input
                type="datetime-local"
                dir="ltr"
                value={sched.dueAt}
                onChange={(e) => setSched({ ...sched, dueAt: e.target.value })}
                className="!py-1.5 text-sm"
              />
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span>תזכורת ב־</span>
                {[
                  { k: "email", l: "מייל" },
                  { k: "sms", l: "SMS" },
                  { k: "whatsapp", l: "וואטסאפ" },
                ].map((c) => (
                  <label key={c.k} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={(sched as any)[c.k]}
                      onChange={(e) => setSched({ ...sched, [c.k]: e.target.checked })}
                      className="h-3.5 w-3.5 accent-cyan-500"
                    />
                    {c.l}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span>אל:</span>
                {[
                  { k: "toAgent", l: "הסוכן / אני" },
                  { k: "toLead", l: "הליד" },
                ].map((t) => (
                  <label key={t.k} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={(sched as any)[t.k]}
                      onChange={(e) => setSched({ ...sched, [t.k]: e.target.checked })}
                      className="h-3.5 w-3.5 accent-cyan-500"
                    />
                    {t.l}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={sched.minutesBefore}
                  onChange={(e) => setSched({ ...sched, minutesBefore: e.target.value })}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300"
                >
                  <option value="0">בזמן עצמו</option>
                  <option value="15">15 דק׳ לפני</option>
                  <option value="60">שעה לפני</option>
                  <option value="180">3 שעות לפני</option>
                  <option value="1440">יום לפני</option>
                </select>
                <Button
                  size="sm"
                  className="mr-auto"
                  disabled={busy || !sched.dueAt || (!sched.email && !sched.sms && !sched.whatsapp)}
                  onClick={scheduleTask}
                >
                  {busy ? "קובע…" : "קביעה + תזכורת"}
                </Button>
              </div>
            </div>

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

            {/* Unified timeline: notes + activity trail */}
            <h3 className="mb-2 mt-6 text-sm font-bold text-slate-300">
              ציר פעילות והערות
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
              {[
                ...lead.notes.map((n) => ({ type: "note" as const, at: n.createdAt, note: n })),
                ...lead.activities.map((a) => ({ type: "activity" as const, at: a.createdAt, activity: a })),
              ]
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((item, i) =>
                  item.type === "note" ? (
                    <div key={`n${i}`} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                        <span className="font-medium text-slate-400">💬 {item.note.authorName}</span>
                        <span>{formatDateTime(item.note.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-line text-sm text-slate-200">{item.note.body}</p>
                    </div>
                  ) : (
                    <div key={`a${i}`} className="flex items-center gap-2 px-3 py-1 text-xs">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500/60" />
                      <span className="text-slate-400">
                        <b className="text-slate-300">{ACTIVITY_LABELS[item.activity.kind] ?? item.activity.kind}</b>
                        {item.activity.fromValue || item.activity.toValue ? (
                          <>
                            {": "}
                            {item.activity.fromValue ? `${item.activity.fromValue} ← ` : ""}
                            <b className="text-slate-300">{item.activity.toValue ?? ""}</b>
                          </>
                        ) : null}
                        {item.activity.note ? ` · ${item.activity.note}` : ""}
                        {` · ${item.activity.actorName}`}
                      </span>
                      <span className="mr-auto whitespace-nowrap text-slate-600">
                        {formatDateTime(item.activity.createdAt)}
                      </span>
                    </div>
                  )
                )}
              {lead.notes.length === 0 && lead.activities.length === 0 ? (
                <p className="text-xs text-slate-600">אין פעילות עדיין.</p>
              ) : null}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
