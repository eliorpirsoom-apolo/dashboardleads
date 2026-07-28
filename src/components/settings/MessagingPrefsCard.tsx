"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { Card } from "@/components/ui";

const ITEMS = [
  { k: "broadcast", l: "דיוור יזום ללקוחות שלי", hint: "לשלוח קמפיינים/הודעות לאנשי הקשר שלי" },
  { k: "leadAlerts", l: "התראות על לידים חדשים", hint: "לקבל התראה על כל ליד שנכנס" },
  { k: "email", l: "ערוץ מייל", hint: "" },
  { k: "sms", l: "ערוץ SMS", hint: "" },
  { k: "whatsapp", l: "ערוץ וואטסאפ", hint: "" },
];

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${on ? "bg-cyan-500" : "bg-slate-700"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "right-0.5" : "right-[22px]"}`}
      />
    </button>
  );
}

// צד-לקוח: מדליק/מכבה מתוך מה שהמשרד התיר.
export default function MessagingPrefsCard() {
  const [allowed, setAllowed] = useState<Record<string, boolean>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<{ allowed: Record<string, boolean>; enabled: Record<string, boolean> }>("/api/messaging-prefs")
      .then((d) => {
        setAllowed(d.allowed || {});
        setEnabled(d.enabled || {});
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function toggle(k: string) {
    const next = { ...enabled, [k]: !enabled[k] };
    setEnabled(next);
    setBusy(true);
    setMsg("");
    try {
      const d = await api<{ enabled: Record<string, boolean> }>("/api/messaging-prefs", {
        method: "POST",
        json: { enabled: next },
      });
      setEnabled(d.enabled);
      setMsg("נשמר ✓");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  const visible = ITEMS.filter((i) => allowed[i.k]);

  return (
    <Card>
      <h3 className="mb-1 text-base font-bold text-slate-100">העדפות דיוור</h3>
      <p className="mb-4 text-xs text-slate-500">
        הפעל/כבה את האפשרויות שהמשרד איפשר לחשבון שלך.
      </p>
      {visible.length === 0 ? (
        <p className="py-3 text-center text-sm text-slate-600">
          המשרד טרם איפשר אפשרויות דיוור לחשבון. פנו למנהל המערכת.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((i) => (
            <div
              key={i.k}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-200">{i.l}</p>
                {i.hint ? <p className="truncate text-[11px] text-slate-500">{i.hint}</p> : null}
              </div>
              <Toggle on={!!enabled[i.k]} disabled={busy} onClick={() => toggle(i.k)} />
            </div>
          ))}
          {msg ? <p className="text-xs text-slate-400">{msg}</p> : null}
        </div>
      )}
    </Card>
  );
}
