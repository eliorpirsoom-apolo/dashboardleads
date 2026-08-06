"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Chip, Field, Input } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

interface ProjectLite { id: string; name: string }
interface Marketer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  whatsappPhone: string | null;
  active: boolean;
  lastLoginAt: string | null;
  projectIds: string[];
}

export default function MarketersManager() {
  const [marketers, setMarketers] = useState<Marketer[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [edit, setEdit] = useState<Marketer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ marketers: Marketer[]; projects: ProjectLite[] }>("/api/marketers");
      setMarketers(d.marketers);
      setProjects(d.projects);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const projName = (id: string) => projects.find((p) => p.id === id)?.name ?? "—";

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">המשווקים שלי</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              לכל משווק גישה ללידים ולנתונים של הפרויקטים שמשויכים אליו בלבד.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Icon name="plus" className="h-4 w-4" />
            משווק חדש
          </Button>
        </div>

        {loading ? (
          <p className="py-4 text-center text-sm text-slate-500">טוען…</p>
        ) : marketers.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">אין משווקים עדיין. פִּתחו את הראשון עם הכפתור למעלה.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {marketers.map((m) => (
              <div key={m.id} className={`flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 ${m.active ? "" : "opacity-50"}`}>
                <Icon name="users" className="h-4 w-4 text-indigo-400" />
                <span className="text-sm font-medium text-slate-700">{m.name}</span>
                <span dir="ltr" className="text-xs text-slate-500">{m.email}</span>
                {m.phone ? <span dir="ltr" className="text-xs text-slate-400">{m.phone}</span> : null}
                {m.whatsappPhone ? <Chip color="#25d366">התראות וואטסאפ</Chip> : null}
                {!m.active ? <Chip color="#f87171">מושבת</Chip> : null}
                <div className="flex flex-wrap items-center gap-1">
                  {m.projectIds.length === 0 ? (
                    <Chip color="#f59e0b">ללא פרויקט — לא רואה כלום</Chip>
                  ) : (
                    m.projectIds.map((pid) => <Chip key={pid} color="#3a5bd9">{projName(pid)}</Chip>)
                  )}
                </div>
                <span className="mr-auto text-[11px] text-slate-500">
                  {m.lastLoginAt ? `כניסה אחרונה: ${formatDateTime(m.lastLoginAt)}` : "טרם התחבר"}
                </span>
                <button
                  onClick={() => setEdit(m)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600"
                  title="ניהול משווק"
                >
                  <Icon name="edit" className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showCreate ? (
        <MarketerModal
          mode="create"
          projects={projects}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
        />
      ) : null}

      {edit ? (
        <MarketerModal
          mode="edit"
          marketer={edit}
          projects={projects}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); load(); }}
        />
      ) : null}
    </div>
  );
}

function MarketerModal({
  mode,
  marketer,
  projects,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  marketer?: Marketer;
  projects: ProjectLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(marketer?.name ?? "");
  const [email, setEmail] = useState(marketer?.email ?? "");
  const [phone, setPhone] = useState(marketer?.phone ?? "");
  const [whatsappPhone, setWhatsappPhone] = useState(marketer?.whatsappPhone ?? "");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(marketer?.active ?? true);
  const [projectIds, setProjectIds] = useState<Set<string>>(new Set(marketer?.projectIds ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggle(id: string) {
    setProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "create") {
        await api("/api/marketers", {
          method: "POST",
          json: {
            name, email,
            phone: phone || null,
            whatsappPhone: whatsappPhone || null,
            password: password || undefined,
            projectIds: [...projectIds],
          },
        });
      } else {
        await api(`/api/marketers/${marketer!.id}`, {
          method: "PATCH",
          json: {
            name,
            phone: phone || null,
            whatsappPhone: whatsappPhone || null,
            active,
            ...(password ? { password } : {}),
            projectIds: [...projectIds],
          },
        });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!marketer) return;
    if (!confirm(`למחוק לצמיתות את המשווק "${marketer.name}"? הגישה שלו תיסגר. (היסטוריית הלידים נשמרת.)`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/marketers/${marketer.id}`, { method: "DELETE" });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={mode === "create" ? "משווק חדש" : `ניהול משווק — ${marketer!.name}`} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Field label="שם מלא">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>

        <Field label="אימייל" hint={mode === "edit" ? "לא ניתן לשינוי" : "המשווק יתחבר עם המייל הזה"}>
          <Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={mode === "edit"} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="טלפון">
            <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0501234567" />
          </Field>
          <Field label={mode === "create" ? "סיסמה" : "איפוס סיסמה"} hint="ריק = Google בלבד">
            <Input dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "edit" ? "חדשה (אופציונלי)" : ""} />
          </Field>
        </div>

        <Field
          label="וואטסאפ להתראות לידים 📲"
          hint="כל ליד חדש שישויך למשווק יישלח לוואטסאפ הזה. ריק = ללא התראות. נפרד מהטלפון — מספרי מענה וירטואליים לא מקבלים וואטסאפ."
        >
          <Input dir="ltr" value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} placeholder="0501234567" />
        </Field>

        {mode === "edit" ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
            חשבון פעיל <span className="text-xs text-slate-400">(ביטול הסימון ינתק את המשווק)</span>
          </label>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-sm font-bold text-slate-700">פרויקטים משויכים</p>
          <p className="mb-2 text-[11px] text-slate-500">
            המשווק יראה לידים ונתונים רק של הפרויקטים המסומנים. בלי סימון — לא יראה כלום.
          </p>
          {projects.length === 0 ? (
            <p className="text-xs text-slate-400">אין פרויקטים. צרו פרויקט קודם.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {projects.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="h-4 w-4" checked={projectIds.has(p.id)} onChange={() => toggle(p.id)} />
                  {p.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          {mode === "edit" ? (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-xl px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              מחיקה
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
            <Button type="submit" disabled={busy}>{busy ? "שומר…" : mode === "create" ? "פתיחה" : "שמירה"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
