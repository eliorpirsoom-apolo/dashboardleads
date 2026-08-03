"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface AgentConfig {
  enabled: boolean;
  allowedNumbers: string;
  instructions: string | null;
  model: string | null;
  replyConfirm: boolean;
}

// מתג הפעלה/כיבוי פשוט.
function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 text-sm font-medium text-slate-700"
    >
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${on ? "bg-[#3a5bd9]" : "bg-slate-300"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${on ? "translate-x-0.5" : "translate-x-4"}`} />
      </span>
      {label}
    </button>
  );
}

export default function TaskAgentCard() {
  const [cfg, setCfg] = useState<AgentConfig | null>(null);
  const [aiReady, setAiReady] = useState(true);
  const [waReady, setWaReady] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [testText, setTestText] = useState("");
  const [testing, setTesting] = useState(false);
  const [testTasks, setTestTasks] = useState<{ title: string; dueHint?: string | null }[] | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ config: AgentConfig; aiReady: boolean; waReady: boolean }>("/api/task-agent");
      setCfg(d.config);
      setAiReady(d.aiReady);
      setWaReady(d.waReady);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await api("/api/task-agent", {
        method: "PATCH",
        json: {
          enabled: cfg.enabled,
          allowedNumbers: cfg.allowedNumbers,
          instructions: cfg.instructions,
          model: cfg.model,
          replyConfirm: cfg.replyConfirm,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    if (!testText.trim()) return;
    setTesting(true);
    setTestTasks(null);
    setError("");
    try {
      const d = await api<{ tasks: { title: string; dueHint?: string | null }[] }>("/api/task-agent/test", {
        method: "POST",
        json: { text: testText, instructions: cfg?.instructions ?? null },
      });
      setTestTasks(d.tasks);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTesting(false);
    }
  }

  if (!cfg) return null;

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-lg">🤖</span>
        <h3 className="text-base font-bold text-slate-800">סוכן משימות (וואטסאפ ← מאגר)</h3>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        שולחים הודעת וואטסאפ ממספר מורשה למספר של המשרד, והסוכן מזהה משימות ומוסיף אותן אוטומטית ל<b>מאגר המהיר</b>.
      </p>

      {!aiReady ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">⚠️ מנוע ה-AI אינו מוגדר (OPENAI_API_KEY) — הסוכן לא יחלץ משימות עד שיוגדר.</p>
      ) : null}
      {!waReady ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">⚠️ וואטסאפ אינו מוגדר — הסוכן לא יקבל הודעות נכנסות.</p>
      ) : null}
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <Toggle on={cfg.enabled} onClick={() => setCfg({ ...cfg, enabled: !cfg.enabled })} label={cfg.enabled ? "הסוכן פעיל" : "הסוכן כבוי"} />
          <Toggle on={cfg.replyConfirm} onClick={() => setCfg({ ...cfg, replyConfirm: !cfg.replyConfirm })} label="אישור חזרה בוואטסאפ" />
        </div>

        <Field label="מספרים מורשים" hint="רק הודעות מהמספרים האלה יעובדו. מספר בכל שורה (או מופרד בפסיק). פורמט: 0501234567 / 972501234567.">
          <Textarea
            dir="ltr"
            rows={3}
            value={cfg.allowedNumbers}
            onChange={(e) => setCfg({ ...cfg, allowedNumbers: e.target.value })}
            placeholder={"0501234567\n0527654321"}
          />
        </Field>

        <Field label="הנחיה לסוכן (אופציונלי)" hint="מה להחשיב כמשימה, אנשי צוות, ניסוח מועדף וכו׳.">
          <Textarea
            rows={2}
            value={cfg.instructions ?? ""}
            onChange={(e) => setCfg({ ...cfg, instructions: e.target.value })}
            placeholder="לדוגמה: התייחס גם לתזכורות אישיות. אם מוזכר לקוח — כלול את שמו בכותרת."
          />
        </Field>

        <div className="flex items-center justify-end gap-3">
          {saved ? <span className="text-xs text-emerald-600">נשמר ✓</span> : null}
          <Button disabled={saving} onClick={save}>{saving ? "שומר…" : "שמירת הגדרות"}</Button>
        </div>

        {/* תיבת בדיקה */}
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="mb-2 text-sm font-bold text-slate-700">🧪 בדיקה — איך הסוכן יחלץ משימות</p>
          <Textarea
            rows={3}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="הדביקו טקסט לדוגמה, למשל: תזכיר לי להתקשר לדפוס מחר בבוקר ולהזמין באנרים לפרויקט אלון"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-400">בדיקה בלבד — לא נשמר במאגר.</p>
            <Button variant="ghost" disabled={testing || !testText.trim()} onClick={runTest}>
              <Icon name="tasks" className="h-4 w-4" />
              {testing ? "בודק…" : "בדיקת חילוץ"}
            </Button>
          </div>
          {testTasks !== null ? (
            testTasks.length === 0 ? (
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">לא זוהו משימות בטקסט הזה.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {testTasks.map((t, i) => (
                  <li key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
                    • {t.title}
                    {t.dueHint ? <span className="text-slate-400"> — {t.dueHint}</span> : null}
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </div>
    </Card>
  );
}
