"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "improvement", label: "שיפור" },
  { value: "bug", label: "תקלה" },
  { value: "idea", label: "רעיון" },
  { value: "other", label: "אחר" },
];

// כפתור "משוב" צף בכל עמודי המשרד — כל עובד יכול לשלוח הערה/הדגש לשיפור.
// למנהל: בועה אדומה עם מספר המשובים הפתוחים (כמו "לא נקראו" בוואטסאפ).
export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("improvement");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [openCount, setOpenCount] = useState(0);

  // ספירת משובים פתוחים — נגיש למנהל בלבד; אצל עובדים הקריאה נכשלת בשקט.
  const loadCount = useCallback(() => {
    api<{ openCount: number }>("/api/feedback?count=1")
      .then((d) => setOpenCount(d.openCount))
      .catch(() => setOpenCount(0));
  }, []);
  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, 120000);
    return () => clearInterval(t);
  }, [loadCount]);

  function reset() {
    setCategory("improvement");
    setText("");
    setError("");
    setDone(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/feedback", { method: "POST", json: { category, text } });
      setDone(true);
      setText("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true); }}
        className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full bg-[#3a5bd9] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#3a5bd9]/30 transition hover:bg-[#2f4bc0]"
        title={openCount > 0 ? `${openCount} משובים פתוחים — לחצו לצפייה בתיבת המשוב` : "שליחת משוב על המערכת"}
      >
        <Icon name="note" className="h-4 w-4" />
        משוב
        {openCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white shadow">
            {openCount > 99 ? "99+" : openCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <Modal title="משוב על המערכת" onClose={() => setOpen(false)}>
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Icon name="check" className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-slate-700">תודה! המשוב נשלח למנהלה.</p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => reset()}>שליחת עוד</Button>
                <Button onClick={() => setOpen(false)}>סגירה</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <p className="text-xs text-slate-500">
                הערה, הדגש או רעיון לשיפור המערכת — יגיע ישירות למנהלה.
              </p>
              {openCount > 0 ? (
                <a
                  href="/admin/feedback"
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  🔔 יש {openCount} משובים פתוחים מהצוות — לצפייה בתיבת המשוב
                </a>
              ) : null}
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      category === c.value
                        ? "bg-[#3a5bd9] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                required
                rows={5}
                placeholder="מה תרצו לשפר? מה חסר? מה לא עובד?"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#3a5bd9] focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>ביטול</Button>
                <Button type="submit" disabled={busy || text.trim().length < 2}>
                  {busy ? "שולח…" : "שליחה"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      ) : null}
    </>
  );
}
