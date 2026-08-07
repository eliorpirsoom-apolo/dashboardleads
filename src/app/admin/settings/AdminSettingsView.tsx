"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Chip, Field, Input } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";
import MaterialTemplatesManager from "@/components/settings/MaterialTemplatesManager";
import TaskAgentCard from "@/components/settings/TaskAgentCard";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  active: boolean;
  adminRole: string;
  lastLoginAt: string | null;
  googleId: string | null;
  moduleAccess: string | null;
}

// מודולים הניתנים להגבלה לעובד (מקביל ל-ADMIN_MODULES בשרת). "סקירה" ו"החשבון שלי" תמיד פתוחים.
const MODULE_OPTIONS: { key: string; label: string }[] = [
  { key: "clients", label: "לקוחות" },
  { key: "tasks", label: "משימות" },
  { key: "calendar", label: "לוח שנה" },
  { key: "documents", label: "מסמכים" },
  { key: "quotes", label: "הצעות מחיר" },
  { key: "studio", label: "סטודיו" },
  { key: "messages", label: "הודעות" },
  { key: "payments", label: "תשלומים" },
  { key: "settings", label: "הגדרות" },
];
const DEFAULT_STAFF_MODULES = MODULE_OPTIONS.map((m) => m.key).filter((k) => k !== "payments");

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
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
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
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {/* Global connections status */}
      <Card>
        <h3 className="mb-1 text-base font-bold text-slate-800">חיבורים גלובליים</h3>
        <p className="mb-4 text-xs text-slate-500">
          מוגדרים במשתני הסביבה של Vercel — הוראות מלאות בקובץ CONNECTIONS.md.
          חיבורים ללקוח ספציפי (Meta, פייקול, Search Console) — בהגדרות הלקוח.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(GLOBAL_LABELS).map(([key, meta]) => (
            <div key={key} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <span
                className={`h-2.5 w-2.5 rounded-full ${globals[key] ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" : "bg-slate-600"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700">{meta.label}</p>
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
            <h3 className="text-base font-bold text-slate-800">משתמשי המשרד</h3>
            <p className="mt-0.5 text-xs text-slate-500">חשבונות ADMIN — רואים ומנהלים את כל הלקוחות.</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Icon name="plus" className="h-4 w-4" />
            משתמש משרד
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div key={u.id} className={`flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 ${u.active ? "" : "opacity-50"}`}>
              <Icon name="users" className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-medium text-slate-700">{u.name}</span>
              <span dir="ltr" className="text-xs text-slate-500">{u.email}</span>
              <Chip color={u.adminRole === "staff" ? "#94a3b8" : "#818cf8"}>
                {u.adminRole === "staff" ? "עובד משרד" : "מנהל משרד"}
              </Chip>
              {u.googleId ? <Chip color="#38bdf8">Google</Chip> : null}
              {!u.active ? <Chip color="#f87171">מושבת</Chip> : null}
              <span className="mr-auto text-[11px] text-slate-600">
                {u.lastLoginAt ? `כניסה אחרונה: ${formatDateTime(u.lastLoginAt)}` : "טרם התחבר"}
              </span>
              <button
                onClick={() => setEditUser(u)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600"
                title="ניהול משתמש"
              >
                <Icon name="edit" className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* ===== וואטסאפ — כל ההגדרות במסגרת אחת, מהחיבור אל השימושים ===== */}
      <section className="rounded-2xl border-2 border-emerald-300/60 bg-emerald-50/30 p-4">
        <div className="mb-3 flex items-start gap-2.5">
          <Icon name="whatsapp" className="mt-0.5 h-6 w-6 text-emerald-500" />
          <div>
            <h2 className="text-lg font-bold text-slate-800">וואטסאפ והודעות</h2>
            <p className="text-xs text-slate-500">
              כל ערוצי ההודעות במקום אחד: קודם החיבור, ואז השימושים — שיחות עם לידים,
              בוט הקבוצות, סוכן המשימות ובדיקת SMS.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <WhatsAppCard />
          <LeadChatCard />
          <WhatsappBroadcastCard />
          <TaskAgentCard />
          <SmsCard />
        </div>
      </section>

      <LeadSlaCard />

      <SumitCard />

      <MaterialTemplatesManager />

      <AuditLogCard />

      {showCreate ? (
        <CreateAdminModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      ) : null}

      {editUser ? (
        <EditAdminModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => {
            setEditUser(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

// חיבור SUMIT — סנכרון מסמכים והצעות מחיר.
function SumitCard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    api<{ configured: boolean }>("/api/integrations/sumit/sync")
      .then((d) => setConfigured(d.configured))
      .catch(() => setConfigured(false));
  }, []);

  async function sync() {
    setBusy(true);
    setResult("");
    try {
      const r = await api<{
        documentsSeen: number;
        quotesLinked: number;
        clientsMatched: number;
        clientsCreated: number;
        invoicesSeen: number;
        invoicesApplied: number;
        invoicesUnmatched: number;
      }>("/api/integrations/sumit/sync", { method: "POST" });
      setResult(
        `נסרקו ${r.documentsSeen} מסמכים · ${r.quotesLinked} הצעות ל-${r.clientsMatched} לקוחות ` +
          `(${r.clientsCreated} נפתחו) · חשבוניות: ${r.invoicesApplied} הוחלו על לוח התשלומים` +
          (r.invoicesUnmatched ? ` · ${r.invoicesUnmatched} ללא לקוח תואם` : "")
      );
    } catch (e: any) {
      setResult("שגיאה: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800">SUMIT — הנהלת חשבונות</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            משיכת חשבוניות, קבלות והצעות מחיר. משויכות ללקוח לפי מייל ומופיעות בדשבורד שלו.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Chip color={configured ? "#34d399" : "#64748b"}>
            {configured === null ? "…" : configured ? "מחובר" : "לא מוגדר"}
          </Chip>
          <Button size="sm" disabled={busy || !configured} onClick={sync}>
            <Icon name="chart" className="h-4 w-4" />
            {busy ? "מסנכרן…" : "סנכרון עכשיו"}
          </Button>
        </div>
      </div>
      {result ? <p className="text-xs text-slate-400">{result}</p> : null}
    </Card>
  );
}

// חיבור SMS (MultiSend / פייקול) — בדיקת שליחה חיה.
function SmsCard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    api<{ configured: boolean }>("/api/integrations/sms/test")
      .then((d) => setConfigured(d.configured))
      .catch(() => setConfigured(false));
  }, []);

  async function sendTest() {
    setBusy(true);
    setResult("");
    try {
      const r = await api<{ status: string }>("/api/integrations/sms/test", {
        method: "POST",
        json: { to: phone.trim() },
      });
      setResult(
        r.status === "sent"
          ? `נשלחה הודעת בדיקה ל-${phone} ✓`
          : `הבקשה עברה אך הסטטוס: ${r.status}`
      );
    } catch (e: any) {
      setResult("שגיאה: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800">5 · בדיקת SMS (MultiSend — פייקול)</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            תזכורות והתראות ב-SMS. הגדרה במשתני סביבה: MULTISEND_USER, MULTISEND_PASSWORD, SMS_FROM.
          </p>
        </div>
        <Chip color={configured ? "#34d399" : "#64748b"}>
          {configured === null ? "…" : configured ? "מחובר" : "לא מוגדר"}
        </Chip>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <Field label="מספר לבדיקה">
            <Input
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0501234567"
            />
          </Field>
        </div>
        <Button
          size="sm"
          disabled={busy || !configured || phone.trim().length < 9}
          onClick={sendTest}
        >
          <Icon name="phone" className="h-4 w-4" />
          {busy ? "שולח…" : "שלח SMS בדיקה"}
        </Button>
      </div>
      {result ? <p className="mt-2 text-xs text-slate-400">{result}</p> : null}
    </Card>
  );
}

// חיבור וואטסאפ (Green API) — בדיקת שליחה חיה.
function WhatsAppCard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    api<{ configured: boolean }>("/api/integrations/whatsapp/test")
      .then((d) => setConfigured(d.configured))
      .catch(() => setConfigured(false));
  }, []);

  async function sendTest() {
    setBusy(true);
    setResult("");
    try {
      const r = await api<{ status: string }>("/api/integrations/whatsapp/test", {
        method: "POST",
        json: { to: phone.trim() },
      });
      setResult(r.status === "sent" ? `נשלחה הודעת בדיקה ל-${phone} ✓` : `הסטטוס: ${r.status}`);
    } catch (e: any) {
      setResult("שגיאה: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800">1 · חיבור המספר הראשי (Green API)</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            המספר של הסוכנות — דרכו נשלח כל מה שאין לו מספר ייעודי. מוגדר במשתני סביבה
            (GREENAPI_ID_INSTANCE, GREENAPI_API_TOKEN). מספר ייעודי ללקוח מגדירים בהגדרות הלקוח.
          </p>
        </div>
        <Chip color={configured ? "#34d399" : "#64748b"}>
          {configured === null ? "…" : configured ? "מחובר" : "לא מוגדר"}
        </Chip>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <Field label="מספר לבדיקה">
            <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0501234567" />
          </Field>
        </div>
        <Button size="sm" disabled={busy || !configured || phone.trim().length < 9} onClick={sendTest}>
          <Icon name="whatsapp" className="h-4 w-4" />
          {busy ? "שולח…" : "שלח וואטסאפ בדיקה"}
        </Button>
      </div>
      {result ? <p className="mt-2 text-xs text-slate-400">{result}</p> : null}
    </Card>
  );
}

// בוט קבוצות וואטסאפ — הודעת בוקר/סוף-יום מתוזמנת לקבוצות שהמספר חבר בהן.
const DAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
interface BroadcastCfg {
  broadcastEnabled: boolean;
  morningTime: string; morningText: string;
  eodTime: string; eodText: string;
  broadcastDays: string;
  lastMorningSentOn: string | null; lastEodSentOn: string | null;
}
function WhatsappBroadcastCard() {
  const [waReady, setWaReady] = useState<boolean | null>(null);
  const [cfg, setCfg] = useState<BroadcastCfg | null>(null);
  const [groups, setGroups] = useState<{ id: string; name: string; included: boolean }[]>([]);
  const [days, setDays] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ waReady: boolean; config: BroadcastCfg; groups: typeof groups }>("/api/admin-ops/broadcast");
      setWaReady(d.waReady);
      setCfg(d.config);
      setGroups(d.groups);
      setDays(new Set((d.config.broadcastDays || "").split(",").map((s) => s.trim()).filter(Boolean)));
    } catch (e: any) {
      setErr(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function toggleDay(d: string) {
    setDays((prev) => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; });
  }
  function toggleGroup(id: string) {
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, included: !g.included } : g)));
  }

  async function save() {
    if (!cfg) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      await api("/api/admin-ops/broadcast", {
        method: "PATCH",
        json: {
          broadcastEnabled: cfg.broadcastEnabled,
          morningTime: cfg.morningTime, morningText: cfg.morningText,
          eodTime: cfg.eodTime, eodText: cfg.eodText,
          broadcastDays: Array.from(days).sort().join(","),
          excludeGroups: groups.filter((g) => !g.included).map((g) => g.id),
        },
      });
      setMsg("נשמר ✓");
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function testSend() {
    if (!confirm("שליחת בדיקה מיידית לכל הקבוצות המסומנות — עכשיו. להמשיך?")) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await api<{ result: { morning: number | false; eod: number | false } }>("/api/admin-ops/broadcast", { method: "POST" });
      setMsg(`נשלח לבדיקה — בוקר: ${r.result.morning || 0} קבוצות · סוף-יום: ${r.result.eod || 0} קבוצות`);
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const includedCount = groups.filter((g) => g.included).length;

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-800">3 · בוט הקבוצות 📣</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            הודעת בוקר וסוף-יום אוטומטיות לקבוצות שהמספר הראשי חבר בהן, בימים ובשעות שתגדיר.
          </p>
        </div>
        <Chip color={cfg?.broadcastEnabled ? "#34d399" : "#94a3b8"}>
          {cfg?.broadcastEnabled ? "פעיל" : "כבוי"}
        </Chip>
      </div>

      {err ? <p className="mb-2 text-sm text-red-600">{err}</p> : null}
      {msg ? <p className="mb-2 text-sm text-emerald-600">{msg}</p> : null}
      {waReady === false ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          וואטסאפ (Green API) אינו מוגדר — הבוט לא יוכל לשלוח.
        </p>
      ) : null}

      {!cfg ? (
        <p className="py-3 text-center text-sm text-slate-500">טוען…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={cfg.broadcastEnabled} onChange={(e) => setCfg({ ...cfg, broadcastEnabled: e.target.checked })} className="h-4 w-4" />
            הפעלת הבוט
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-sm font-bold text-slate-700">בוקר</p>
              <Field label="שעה"><Input dir="ltr" value={cfg.morningTime} onChange={(e) => setCfg({ ...cfg, morningTime: e.target.value })} placeholder="09:00" /></Field>
              <div className="mt-2">
                <label className="mb-1 block text-xs text-slate-500">טקסט</label>
                <textarea value={cfg.morningText} onChange={(e) => setCfg({ ...cfg, morningText: e.target.value })} rows={2} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#3a5bd9] focus:outline-none" />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-sm font-bold text-slate-700">סוף יום</p>
              <Field label="שעה"><Input dir="ltr" value={cfg.eodTime} onChange={(e) => setCfg({ ...cfg, eodTime: e.target.value })} placeholder="17:00" /></Field>
              <div className="mt-2">
                <label className="mb-1 block text-xs text-slate-500">טקסט</label>
                <textarea value={cfg.eodText} onChange={(e) => setCfg({ ...cfg, eodText: e.target.value })} rows={2} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#3a5bd9] focus:outline-none" />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-bold text-slate-700">ימי שליחה</p>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((lbl, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(String(i))}
                  className={`h-9 w-9 rounded-full text-sm font-medium transition ${days.has(String(i)) ? "bg-[#3a5bd9] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-bold text-slate-700">
              קבוצות ({includedCount} מתוך {groups.length} יקבלו)
            </p>
            {groups.length === 0 ? (
              <p className="text-xs text-slate-500">{waReady ? "לא נמצאו קבוצות שהמספר חבר בהן." : "—"}</p>
            ) : (
              <div className="thin-scroll flex max-h-52 flex-col gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                {groups.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                    <input type="checkbox" checked={g.included} onChange={() => toggleGroup(g.id)} className="h-4 w-4" />
                    <span className="truncate">{g.name || g.id}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <span className="text-[11px] text-slate-500">
              {cfg.lastMorningSentOn ? `בוקר אחרון: ${cfg.lastMorningSentOn}` : "בוקר: טרם נשלח"} · {cfg.lastEodSentOn ? `סוף-יום אחרון: ${cfg.lastEodSentOn}` : "סוף-יום: טרם נשלח"}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={busy || !waReady || includedCount === 0} onClick={testSend}>
                <Icon name="whatsapp" className="h-4 w-4" />
                שלח בדיקה עכשיו
              </Button>
              <Button disabled={busy} onClick={save}>{busy ? "שומר…" : "שמירה"}</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// שיחות וואטסאפ עם לידים — מתג ראשי (ברירת מחדל: כבוי).
function LeadChatCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ enabled: boolean }>("/api/admin-ops/lead-chat")
      .then((d) => setEnabled(d.enabled))
      .catch((e) => setErr(e.message));
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    setErr("");
    try {
      await api("/api/admin-ops/lead-chat", { method: "PATCH", json: { enabled: next } });
      setEnabled(next);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-800">2 · שיחות עם לידים 💬</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            צ׳אט דו-כיווני מכרטיס הליד: שליחה לליד + קליטת התשובות שלו למערכת, כולל עדכון למשווק.
            לקוח עם מספר וואטסאפ ייעודי (מוגדר בהגדרות הלקוח) — הלידים שלו ישוחחו דרך המספר שלו;
            אחרת דרך מספר הסוכנות.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Chip color={enabled ? "#34d399" : "#94a3b8"}>{enabled === null ? "…" : enabled ? "פעיל" : "כבוי"}</Chip>
          <Button size="sm" variant={enabled ? "ghost" : undefined} disabled={busy || enabled === null} onClick={() => toggle(!enabled)}>
            {busy ? "…" : enabled ? "כיבוי" : "הפעלה"}
          </Button>
        </div>
      </div>
      {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
    </Card>
  );
}

// Speed-to-Lead — תזכורות אי-טיפול בלידים + מדד זמן תגובה.
interface SlaCfg {
  slaEnabled: boolean;
  slaMarketerMinutes: number;
  slaEscalateMinutes: number;
  slaWorkStart: string;
  slaWorkEnd: string;
}
function LeadSlaCard() {
  const [cfg, setCfg] = useState<SlaCfg | null>(null);
  const [stats, setStats] = useState<{ name: string; leads: number; avgMinutes: number }[]>([]);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ config: SlaCfg; stats: typeof stats }>(`/api/admin-ops/sla?days=${days}`);
      setCfg(d.config);
      setStats(d.stats);
    } catch (e: any) {
      setErr(e.message);
    }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!cfg) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      await api("/api/admin-ops/sla", { method: "PATCH", json: cfg });
      setMsg("נשמר ✓");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  function fmtAvg(min: number): string {
    if (min < 60) return `${min} דק׳`;
    return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")} שע׳`;
  }

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-800">⏰ מהירות תגובה ללידים (Speed-to-Lead)</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            ליד שלא טופל (סטטוס/הערה) בזמן → תזכורת וואטסאפ למשווק, ואם עדיין לא — הסלמה למנהלי המשרד.
            נשלח רק בשעות הפעילות. שיחה שנענתה נחשבת מטופלת.
          </p>
        </div>
        <Chip color={cfg?.slaEnabled ? "#34d399" : "#94a3b8"}>{cfg?.slaEnabled ? "פעיל" : "כבוי"}</Chip>
      </div>

      {err ? <p className="mb-2 text-sm text-red-600">{err}</p> : null}
      {msg ? <p className="mb-2 text-sm text-emerald-600">{msg}</p> : null}

      {!cfg ? (
        <p className="py-3 text-center text-sm text-slate-500">טוען…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={cfg.slaEnabled}
              onChange={(e) => setCfg({ ...cfg, slaEnabled: e.target.checked })}
              className="h-4 w-4"
            />
            הפעלת תזכורות אי-טיפול
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="תזכורת למשווק (דק׳)">
              <Input dir="ltr" type="number" min={1} value={cfg.slaMarketerMinutes}
                onChange={(e) => setCfg({ ...cfg, slaMarketerMinutes: Number(e.target.value) || 15 })} />
            </Field>
            <Field label="הסלמה למנהל (דק׳)">
              <Input dir="ltr" type="number" min={1} value={cfg.slaEscalateMinutes}
                onChange={(e) => setCfg({ ...cfg, slaEscalateMinutes: Number(e.target.value) || 60 })} />
            </Field>
            <Field label="תחילת פעילות">
              <Input dir="ltr" value={cfg.slaWorkStart} onChange={(e) => setCfg({ ...cfg, slaWorkStart: e.target.value })} placeholder="08:00" />
            </Field>
            <Field label="סוף פעילות">
              <Input dir="ltr" value={cfg.slaWorkEnd} onChange={(e) => setCfg({ ...cfg, slaWorkEnd: e.target.value })} placeholder="20:00" />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={busy} onClick={save}>{busy ? "שומר…" : "שמירה"}</Button>
          </div>

          {/* מדד זמן תגובה פר משווק */}
          <div className="border-t border-slate-100 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700">זמן תגובה ממוצע פר משווק</p>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              >
                <option value={7}>7 ימים</option>
                <option value={30}>30 ימים</option>
                <option value={90}>90 ימים</option>
              </select>
            </div>
            {stats.length === 0 ? (
              <p className="text-xs text-slate-500">אין עדיין נתונים (נמדד מרגע שלידים מטופלים).</p>
            ) : (
              <div className="flex flex-col gap-1">
                {stats.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                    <span className="font-medium text-slate-700">{s.name}</span>
                    <span className="text-xs text-slate-500">{s.leads} לידים</span>
                    <span className={`mr-auto font-mono text-xs font-bold ${s.avgMinutes <= 15 ? "text-emerald-600" : s.avgMinutes <= 60 ? "text-amber-600" : "text-red-600"}`}>
                      {fmtAvg(s.avgMinutes)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

const AUDIT_LABELS: Record<string, string> = {
  user_created: "משתמש נוצר",
  user_updated: "משתמש עודכן",
  user_deactivated: "משתמש הושבת",
  user_password_reset: "איפוס סיסמה",
  user_role_changed: "שינוי תפקיד",
  client_created: "לקוח נוצר",
  client_updated: "לקוח עודכן",
  client_activated: "לקוח הופעל",
  client_deactivated: "לקוח הושבת",
  integration_connected: "חיבור הוגדר",
  leads_imported: "ייבוא לידים",
};

function AuditLogCard() {
  const [entries, setEntries] = useState<
    { id: string; actorName: string; action: string; details: string | null; createdAt: string }[]
  >([]);
  const [visible, setVisible] = useState(true);
  // מיזעור הכרטיס — נשמר בדפדפן כדי שיישאר כפי שהשארת אותו.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem("settings-collapse-audit") === "1");
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("settings-collapse-audit", c ? "0" : "1");
      return !c;
    });
  }

  useEffect(() => {
    api<{ entries: typeof entries }>("/api/audit")
      .then((d) => setEntries(d.entries))
      .catch(() => setVisible(false)); // staff — הרשאה חסרה, מסתירים
  }, []);

  if (!visible) return null;

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="mb-1 text-base font-bold text-slate-800">יומן פעולות רגישות</h3>
          {!collapsed ? (
            <p className="mb-3 text-xs text-slate-500">
              מי יצר/השבית משתמשים ולקוחות, שינויי הרשאות וחיבורים — 30 האחרונות.
            </p>
          ) : null}
        </div>
        <button
          onClick={toggleCollapsed}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          title={collapsed ? "פתיחה" : "מיזעור"}
        >
          <span className={`text-xs transition-transform ${collapsed ? "" : "rotate-180"}`}>▲</span>
        </button>
      </div>
      {collapsed ? null : entries.length === 0 ? (
        <p className="py-3 text-center text-xs text-slate-600">אין רשומות עדיין.</p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-200">
          {entries.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
              <span className="font-bold text-slate-600">{AUDIT_LABELS[e.action] ?? e.action}</span>
              {e.details ? <span className="text-slate-500">{e.details}</span> : null}
              <span className="text-slate-600">· {e.actorName}</span>
              <span className="mr-auto text-slate-600">{formatDateTime(e.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CreateAdminModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    adminRole: "staff",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // הצעת צירוף משתמש קיים (החזרת 409 עם canPromote מהשרת)
  const [promoteHint, setPromoteHint] = useState<string>("");

  // POST גולמי כדי לקרוא את גוף ה-409 (api() משאיר רק את הודעת השגיאה).
  async function post(promoteExisting: boolean) {
    const res = await fetch("/api/admin-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, promoteExisting }),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data } as { res: Response; data: any };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setPromoteHint("");
    try {
      const { res, data } = await post(false);
      if (res.ok) {
        onCreated();
        return;
      }
      // המייל קיים על משתמש שאינו-משרד — נציע לצרף אותו.
      if (res.status === 409 && data?.canPromote) {
        setPromoteHint(data.message || "כבר קיים משתמש עם האימייל הזה. לצרף אותו כמשתמש משרד?");
        return;
      }
      setError(data?.error || `שגיאה (${res.status})`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmPromote() {
    setBusy(true);
    setError("");
    try {
      const { res, data } = await post(true);
      if (res.ok) {
        onCreated();
        return;
      }
      setError(data?.error || `שגיאה (${res.status})`);
      setPromoteHint("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="משתמש משרד חדש" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {promoteHint ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="mb-2">{promoteHint}</p>
            <p className="mb-3 text-[11px] text-amber-700">
              הצירוף יהפוך את המשתמש הקיים למשתמש משרד וינתק אותו מהלקוח שאליו הוא משויך כרגע.
              ההתחברות הקיימת (Google / סיסמה) נשמרת אלא אם תזינו סיסמה חדשה.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setPromoteHint("")}>ביטול</Button>
              <Button type="button" disabled={busy} onClick={confirmPromote}>
                {busy ? "מצרף…" : "צרף כמשתמש משרד"}
              </Button>
            </div>
          </div>
        ) : null}
        <Field label="שם מלא">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="אימייל">
          <Input dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </Field>
        <Field label="תפקיד" hint='עובד: עבודה שוטפת על לקוחות. מנהל: גם ניהול משתמשים, לקוחות וחיבורים'>
          <select
            value={form.adminRole}
            onChange={(e) => setForm({ ...form, adminRole: e.target.value })}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          >
            <option value="staff">עובד משרד</option>
            <option value="manager">מנהל משרד</option>
          </select>
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

function EditAdminModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [adminRole, setAdminRole] = useState(user.adminRole);
  const [active, setActive] = useState(user.active);
  const [password, setPassword] = useState("");
  const [modules, setModules] = useState<Set<string>>(() => {
    try {
      const arr = user.moduleAccess ? JSON.parse(user.moduleAccess) : null;
      return new Set<string>(Array.isArray(arr) ? arr : DEFAULT_STAFF_MODULES);
    } catch {
      return new Set<string>(DEFAULT_STAFF_MODULES);
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggleModule(key: string) {
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const json: Record<string, unknown> = {
        name,
        adminRole,
        active,
        // מנהל רואה הכל (null); לעובד — הרשימה שנבחרה.
        moduleAccess: adminRole === "staff" ? Array.from(modules) : null,
      };
      if (password.trim()) json.password = password.trim();
      await api(`/api/users/${user.id}`, { method: "PATCH", json });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`למחוק לצמיתות את "${user.name}"? פעולה זו אינה הפיכה. (היסטוריה נשמרת, אך החשבון יימחק.)`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/users/${user.id}`, { method: "DELETE" });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`ניהול משתמש — ${user.name}`} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <p dir="ltr" className="text-xs text-slate-500">{user.email}</p>

        <Field label="שם מלא">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>

        <Field label="תפקיד" hint="עובד: עבודה שוטפת. מנהל: גם ניהול משתמשים, לקוחות וחיבורים.">
          <select
            value={adminRole}
            onChange={(e) => setAdminRole(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          >
            <option value="staff">עובד משרד</option>
            <option value="manager">מנהל משרד</option>
          </select>
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
          חשבון פעיל <span className="text-xs text-slate-400">(ביטול הסימון ישבית את החשבון וינתק את כל החיבורים)</span>
        </label>

        <Field label="איפוס סיסמה" hint="השאירו ריק כדי לא לשנות. שינוי מנתק את כל החיבורים הפעילים.">
          <Input dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="סיסמה חדשה (אופציונלי)" />
        </Field>

        {/* הרשאות מודולים — רק לעובד; מנהל רואה הכל */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-sm font-bold text-slate-700">מודולים גלויים</p>
          {adminRole === "manager" ? (
            <p className="text-xs text-slate-500">מנהל משרד רואה את כל המודולים במערכת.</p>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-slate-500">
                סמנו אילו מודולים העובד יראה. ״סקירה כללית״ ו״החשבון שלי״ תמיד פתוחים.
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {MODULE_OPTIONS.map((m) => (
                  <label key={m.key} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={modules.has(m.key)}
                      onChange={() => toggleModule(m.key)}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-xl px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            מחיקה לצמיתות
          </button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
            <Button type="submit" disabled={busy}>{busy ? "שומר…" : "שמירה"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
