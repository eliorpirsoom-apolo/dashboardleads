"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Chip, Field, Input } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  active: boolean;
  lastLoginAt: string | null;
  googleId: string | null;
}

const GLOBAL_LABELS: Record<string, { label: string; hint: string }> = {
  email: { label: "אימייל (SMTP)", hint: "תזכורות והודעות במייל" },
  sms: { label: "SMS", hint: "ספק הודעות SMS" },
  whatsapp: { label: "וואטסאפ", hint: "WhatsApp Business API" },
  google_login: { label: "כניסה עם Google", hint: "OAuth למסך ההתחברות" },
  storage_r2: { label: "אחסון קבצים (R2)", hint: "בלי חיבור — קבצים נשמרים מקומית" },
  receipts_token: { label: "טוקן קבלות", hint: "לסקריפט העלאת הקבלות מהמשרד" },
};

export default function AdminSettingsView() {
  const [globals, setGlobals] = useState<Record<string, boolean>>({});
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [i, u] = await Promise.all([
        api<{ globals: Record<string, boolean> }>("/api/integrations"),
        api<{ users: AdminUser[] }>("/api/admin-users"),
      ]);
      setGlobals(i.globals);
      setUsers(u.users);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {/* Global connections status */}
      <Card>
        <h3 className="mb-1 text-base font-bold text-slate-100">חיבורים גלובליים</h3>
        <p className="mb-4 text-xs text-slate-500">
          מוגדרים במשתני הסביבה של Vercel — הוראות מלאות בקובץ CONNECTIONS.md.
          חיבורים ללקוח ספציפי (Meta, פייקול, Search Console) — בהגדרות הלקוח.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(GLOBAL_LABELS).map(([key, meta]) => (
            <div key={key} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5">
              <span
                className={`h-2.5 w-2.5 rounded-full ${globals[key] ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" : "bg-slate-600"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-200">{meta.label}</p>
                <p className="truncate text-[11px] text-slate-500">{meta.hint}</p>
              </div>
              <Chip color={globals[key] ? "#34d399" : "#64748b"}>
                {globals[key] ? "מחובר" : "לא מחובר"}
              </Chip>
            </div>
          ))}
        </div>
      </Card>

      {/* Agency users */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100">משתמשי המשרד</h3>
            <p className="mt-0.5 text-xs text-slate-500">חשבונות ADMIN — רואים ומנהלים את כל הלקוחות.</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Icon name="plus" className="h-4 w-4" />
            משתמש משרד
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div key={u.id} className={`flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 ${u.active ? "" : "opacity-50"}`}>
              <Icon name="users" className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-medium text-slate-200">{u.name}</span>
              <span dir="ltr" className="text-xs text-slate-500">{u.email}</span>
              {u.googleId ? <Chip color="#38bdf8">Google</Chip> : null}
              {!u.active ? <Chip color="#f87171">מושבת</Chip> : null}
              <span className="mr-auto text-[11px] text-slate-600">
                {u.lastLoginAt ? `כניסה אחרונה: ${formatDateTime(u.lastLoginAt)}` : "טרם התחבר"}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {showCreate ? (
        <CreateAdminModal
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

function CreateAdminModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin-users", { method: "POST", json: form });
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="משתמש משרד חדש" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Field label="שם מלא">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="אימייל">
          <Input dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="סיסמה" hint="ריק = Google בלבד">
            <Input dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="טלפון">
            <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "יוצר…" : "יצירה"}</Button>
        </div>
      </form>
    </Modal>
  );
}
