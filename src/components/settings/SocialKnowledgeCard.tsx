"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Field, Textarea } from "@/components/ui";
import { useCollapse, CollapseBtn } from "@/components/settings/Collapse";

// ---------------------------------------------------------------------------
// מאגר ידע לתיבת המענה החברתי (שלב 1b): מה ה-AI יודע על הלקוח ומה אסור לו.
// הטיוטות נכתבות אך ורק מתוך הטקסטים כאן. שמירה — מנהל בלבד (ה-API אוכף).
// ---------------------------------------------------------------------------

interface Knowledge {
  about: string;
  faq: string;
  pricing: string;
  tone: string;
  doNotAnswer: string;
  escalate: string;
  aiEnabled: boolean;
  updatedAt: string | null;
}

const FIELDS: { key: keyof Omit<Knowledge, "aiEnabled" | "updatedAt">; label: string; hint: string; rows: number }[] = [
  { key: "about", label: "על העסק", hint: "מה העסק עושה, מה מציעים, מיקום, שעות פעילות, דרכי יצירת קשר. זה הבסיס לכל תשובה.", rows: 4 },
  { key: "faq", label: "שאלות ותשובות נפוצות", hint: "שאלה בשורה, תשובה מתחתיה. ככל שיש יותר — הטיוטות מדויקות יותר.", rows: 6 },
  { key: "pricing", label: "מחירים ומה מותר למסור", hint: "מה מותר לכתוב על מחירים בפומבי ובפרטי. מה שלא כתוב כאן — ה-AI לא יתחייב אליו.", rows: 3 },
  { key: "tone", label: "טון ושפה", hint: "למשל: חם וקצר, בגוף ראשון רבים, בלי אימוג׳י, פנייה בלשון נקבה/זכר/ניטרלי.", rows: 2 },
  { key: "doNotAnswer", label: "אסור לענות / אסור להתחייב", hint: "נושאים שה-AI לא נוגע בהם (יסמן \"דורש אדם\"): למשל הנחות, מועדי מסירה, השוואה למתחרים.", rows: 3 },
  { key: "escalate", label: "מילות הסלמה", hint: "מילה בשורה או מופרדות בפסיק. פנייה שמכילה אחת מהן מסומנת מיד \"דורש אדם\" בלי טיוטה (בנוסף לרשימה המובנית: עורך דין, תביעה, פיצוי, תלונה…).", rows: 2 },
];

export default function SocialKnowledgeCard({ clientId }: { clientId: string }) {
  const [collapsed, toggleCollapse] = useCollapse("social-knowledge");
  const [k, setK] = useState<Knowledge | null>(null);
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<{ knowledge: Knowledge; exists: boolean }>(`/api/social/knowledge?clientId=${clientId}`)
      .then((d) => {
        setK(d.knowledge);
        setExists(d.exists);
      })
      .catch((e) => setMsg("שגיאה: " + e.message));
  }, [clientId]);

  async function save() {
    if (!k) return;
    setBusy(true);
    setMsg("");
    try {
      const { updatedAt: _u, ...body } = k;
      const r = await api<{ updatedAt: string }>("/api/social/knowledge", { method: "PUT", json: { clientId, ...body } });
      setK({ ...k, updatedAt: r.updatedAt });
      setExists(true);
      setMsg("נשמר ✓ — טיוטות חדשות ייכתבו לפי המאגר המעודכן");
    } catch (e: any) {
      setMsg("שגיאה: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-800">🧠 מאגר ידע — תיבת המענה החברתי</h3>
        <CollapseBtn collapsed={collapsed} onClick={toggleCollapse} />
      </div>
      {collapsed ? null : (
        <>
          <p className="mb-3 text-xs text-slate-500">
            ה-AI כותב טיוטות תשובה לתגובות ולהודעות של הלקוח <b>רק</b> מתוך מה שכתוב כאן. בלי מאגר ידע —
            אין טיוטות. כל טיוטה עוברת אישור אדם לפני שליחה.
          </p>
          {!k ? (
            <p className="text-xs text-slate-500">{msg || "טוען…"}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={k.aiEnabled}
                  onChange={(e) => setK({ ...k, aiEnabled: e.target.checked })}
                  className="h-4 w-4 accent-[#3a5bd9]"
                />
                <span className="font-medium">טיוטות AI פעילות ללקוח זה</span>
                {!k.aiEnabled ? <span className="text-xs text-amber-700">— כבוי: פניות ייכנסו לתיבה בלי טיוטה</span> : null}
              </label>
              {!exists ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  עדיין לא הוגדר מאגר ידע ללקוח — הפניות שלו יסומנו &quot;אין מאגר ידע&quot; עד שתשמרו כאן.
                </p>
              ) : null}
              {FIELDS.map((f) => (
                <Field key={f.key} label={f.label}>
                  <Textarea
                    rows={f.rows}
                    value={k[f.key]}
                    onChange={(e) => setK({ ...k, [f.key]: e.target.value })}
                    placeholder={f.hint}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">{f.hint}</p>
                </Field>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={busy} onClick={save}>{busy ? "שומר…" : "שמירת מאגר הידע"}</Button>
                {k.updatedAt ? <span className="text-[11px] text-slate-400">עודכן {formatDateTime(k.updatedAt)}</span> : null}
                {msg ? <span className={`text-[11px] ${msg.startsWith("שגיאה") ? "text-red-600" : "text-emerald-600"}`}>{msg}</span> : null}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
