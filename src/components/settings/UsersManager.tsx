"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Chip, Field, Input } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

export interface ClientUser {
  id: string;
  email: string;
  name: string;
  isAgent: boolean;
  active: boolean;
  phone: string | null;
  whatsappPhone: string | null;
  lastLoginAt: string | Date | null;
  googleId: string | null;
}

// Agency-side: provision the client's users (owner + sales agents).
export default function UsersManager({
  clientId,
  users,
}: {
  clientId: string;
  users: ClientUser[];
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [resetUser, setResetUser] = useState<ClientUser | null>(null);
  const [waUser, setWaUser] = useState<ClientUser | null>(null);
  const [welcoming, setWelcoming] = useState<string | null>(null);

  async function toggleActive(u: ClientUser) {
    await api(`/api/users/${u.id}`, { method: "PATCH", json: { active: !u.active } });
    router.refresh();
  }

  async function sendWelcome(u: ClientUser) {
    setWelcoming(u.id);
    try {
      const r = await api<{ sent: { email: boolean; sms: boolean; whatsapp: boolean } }>(
        `/api/users/${u.id}/welcome`,
        { method: "POST" }
      );
      const ch = [r.sent.email && "מייל", r.sent.sms && "SMS", r.sent.whatsapp && "וואטסאפ"]
        .filter(Boolean)
        .join(" + ");
      alert(ch ? `הזמנה נשלחה ל${u.name} (${ch})` : "ההזמנה נרשמה ביומן (בדקו הגדרות מייל)");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setWelcoming(null);
    }
  }

  async function remove(u: ClientUser) {
    if (
      !confirm(
        `למחוק לצמיתות את המשתמש "${u.name}" (${u.email})?\n\nהפעולה בלתי הפיכה. אם רק רוצים לחסום גישה — עדיף להשבית.`
      )
    )
      return;
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      router.refresh();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800">משתמשי הלקוח</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            בעלים וסוכני מכירות — כולם רואים רק את הלקוח הזה.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Icon name="plus" className="h-4 w-4" />
          משתמש חדש
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {users.map((u) => (
          <div key={u.id} className={`flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 ${u.active ? "" : "opacity-50"}`}>
            <Icon name="users" className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">{u.name}</span>
            <span dir="ltr" className="text-xs text-slate-500">{u.email}</span>
            {u.isAgent ? <Chip color="#fbbf24">משווק</Chip> : null}
            {u.isAgent && u.whatsappPhone ? <Chip color="#25d366">התראות וואטסאפ</Chip> : null}
            {u.googleId ? <Chip color="#38bdf8">Google</Chip> : null}
            {!u.active ? <Chip color="#f87171">מושבת</Chip> : null}
            <span className="text-[11px] text-slate-600">
              {u.lastLoginAt ? `כניסה אחרונה: ${formatDateTime(u.lastLoginAt)}` : "טרם התחבר"}
            </span>
            <div className="mr-auto flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={welcoming === u.id}
                onClick={() => sendWelcome(u)}
                title="שליחת מייל הזמנה להתחברות"
              >
                {welcoming === u.id ? "שולח…" : u.lastLoginAt ? "שלח שוב" : "שלח הזמנה"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setResetUser(u)}>
                איפוס סיסמה
              </Button>
              {u.isAgent ? (
                <Button variant="ghost" size="sm" onClick={() => setWaUser(u)} title="וואטסאפ להתראות לידים">
                  <Icon name="whatsapp" className="h-3.5 w-3.5" />
                  וואטסאפ
                </Button>
              ) : null}
              <button
                onClick={() => toggleActive(u)}
                className="rounded p-1.5 text-slate-500 hover:text-amber-700"
                title={u.active ? "השבתה" : "הפעלה"}
              >
                <Icon name={u.active ? "x" : "check"} className="h-4 w-4" />
              </button>
              <button
                onClick={() => remove(u)}
                className="rounded p-1.5 text-slate-500 hover:text-red-600"
                title="מחיקה לצמיתות"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {users.length === 0 ? (
          <p className="text-xs text-slate-600">אין משתמשים עדיין — צרו את הראשון.</p>
        ) : null}
      </div>

      {showCreate ? (
        <CreateUserModal
          clientId={clientId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            router.refresh();
          }}
        />
      ) : null}

      {resetUser ? (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onDone={() => {
            setResetUser(null);
            router.refresh();
          }}
        />
      ) : null}

      {waUser ? (
        <WhatsappAlertModal
          user={waUser}
          onClose={() => setWaUser(null)}
          onDone={() => {
            setWaUser(null);
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

// וואטסאפ להתראות לידים של משווק — נפרד מהטלפון (מספרי מענה וירטואליים
// לא מקבלים וואטסאפ). ריק = ללא התראות.
function WhatsappAlertModal({
  user,
  onClose,
  onDone,
}: {
  user: ClientUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState(user.whatsappPhone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/users/${user.id}`, {
        method: "PATCH",
        json: { whatsappPhone: value.trim() || null },
      });
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`וואטסאפ להתראות לידים — ${user.name}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Field
          label="מספר וואטסאפ 📲"
          hint="כל ליד חדש שישויך למשווק יישלח לוואטסאפ הזה. השאירו ריק לביטול ההתראות."
        >
          <Input dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0501234567" />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "שומר…" : "שמירה"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateUserModal({
  clientId,
  onClose,
  onCreated,
}: {
  clientId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    whatsappPhone: "",
    isAgent: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/clients/${clientId}/users`, { method: "POST", json: form });
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="משתמש חדש ללקוח" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Field label="שם מלא">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="אימייל">
          <Input dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="סיסמה" hint="ריק = כניסה עם Google בלבד">
            <Input dir="ltr" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="טלפון (לתזכורות SMS)">
            <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.isAgent}
            onChange={(e) => setForm({ ...form, isAgent: e.target.checked })}
            className="h-4 w-4 rounded border-slate-600 bg-white"
          />
          משווק (רואה רק את הפרויקטים המשויכים אליו)
        </label>
        {form.isAgent ? (
          <Field
            label="וואטסאפ להתראות לידים 📲"
            hint="כל ליד חדש שישויך למשווק יישלח לוואטסאפ הזה. ריק = ללא התראות."
          >
            <Input
              dir="ltr"
              value={form.whatsappPhone}
              onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })}
              placeholder="0501234567"
            />
          </Field>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "שומר…" : "שמירה"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: ClientUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/users/${user.id}`, { method: "PATCH", json: { password } });
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`איפוס סיסמה — ${user.name}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Field label="סיסמה חדשה">
          <Input dir="ltr" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "מעדכן…" : "עדכון"}</Button>
        </div>
      </form>
    </Modal>
  );
}
