"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/fetcher";
import { Button, Card, Field, Input } from "@/components/ui";
import { Icon } from "@/components/Icon";

export default function ProfileView({
  initialName,
  initialPhone,
  initialBirthday = "",
  email,
  hasPassword,
  calendar,
}: {
  initialName: string;
  initialPhone: string;
  initialBirthday?: string; // "yyyy-mm-dd"
  email: string;
  hasPassword: boolean;
  // חיבור יומן Google אישי (צד משרד בלבד) — undefined מסתיר את הכרטיס.
  calendar?: { connected: boolean; email: string | null };
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [birthday, setBirthday] = useState(initialBirthday);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await api("/api/me", {
        method: "PATCH",
        json: { name, phone: phone || null, birthday: birthday || null },
      });
      setMsg("הפרטים נשמרו ✓");
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await api("/api/me", {
        method: "PATCH",
        json: { currentPassword: currentPassword || undefined, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setMsg("הסיסמה עודכנה ✓ — כל שאר ההתחברויות שלך נותקו");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnectCalendar() {
    if (!confirm("לנתק את יומן ה-Google? משימות סטודיו חדשות לא ייכנסו ליומן עד חיבור מחדש.")) return;
    setBusy(true);
    try {
      await api("/api/gcal", { method: "DELETE" });
      setMsg("היומן נותק ✓");
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function logoutAll() {
    if (!confirm("לנתק את החשבון מכל המכשירים (כולל זה)?")) return;
    await api("/api/me/logout-all", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {msg ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>
      ) : null}
      {err ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>
      ) : null}

      <Card>
        <h3 className="mb-3 text-base font-bold text-slate-800">הפרטים שלי</h3>
        <form onSubmit={saveDetails} className="flex flex-col gap-3">
          <Field label="אימייל (לא ניתן לשינוי)">
            <Input dir="ltr" value={email} disabled className="opacity-60" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="שם מלא">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="טלפון (לתזכורות SMS/וואטסאפ)">
              <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="תאריך יום הולדת 🎂 (לברכה בצוות)">
              <Input
                type="date"
                dir="ltr"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>שמירה</Button>
          </div>
        </form>
      </Card>

      {calendar ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-800">יומן Google 📅</h3>
              {calendar.connected ? (
                <p className="mt-0.5 text-xs text-slate-500" dir="ltr">
                  ✓ מחובר{calendar.email ? ` — ${calendar.email}` : ""}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-slate-500">
                  חיבור היומן האישי — פגישות ומשימות (כולל משימות סטודיו) ייכנסו אליו אוטומטית.
                </p>
              )}
            </div>
            {calendar.connected ? (
              <Button variant="ghost" disabled={busy} onClick={disconnectCalendar}>
                ניתוק היומן
              </Button>
            ) : (
              <a
                href="/api/integrations/google/connect?kind=calendar"
                className="rounded-xl bg-[#3a5bd9] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2f4bc0]"
              >
                + חיבור יומן Google
              </a>
            )}
          </div>
        </Card>
      ) : null}

      <Card>
        <h3 className="mb-3 text-base font-bold text-slate-800">שינוי סיסמה</h3>
        <form onSubmit={changePassword} className="flex flex-col gap-3">
          {hasPassword ? (
            <Field label="הסיסמה הנוכחית">
              <Input dir="ltr" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </Field>
          ) : (
            <p className="text-xs text-slate-500">
              החשבון מחובר עם Google בלבד — קביעת סיסמה תאפשר גם כניסה רגילה.
            </p>
          )}
          <Field label="סיסמה חדשה" hint="מינימום 8 תווים. שינוי סיסמה מנתק את כל ההתחברויות האחרות">
            <Input dir="ltr" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>עדכון סיסמה</Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">אבטחה</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              ניתוק מיידי של כל ההתחברויות בכל המכשירים.
            </p>
          </div>
          <Button variant="danger" onClick={logoutAll}>
            <Icon name="logout" className="h-4 w-4" />
            ניתוק מכל המכשירים
          </Button>
        </div>
      </Card>
    </div>
  );
}
