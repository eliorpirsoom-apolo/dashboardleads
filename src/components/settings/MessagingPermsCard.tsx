"use client";

import { useState } from "react";
import { api } from "@/lib/fetcher";
import { Card, Button } from "@/components/ui";

const CAPS = [
  { k: "broadcast", l: "דיוור יזום ללקוחות", hint: "שליחת קמפיינים/הודעות לאנשי הקשר של הלקוח" },
  { k: "leadAlerts", l: "התראות על לידים חדשים", hint: "התראה למשתמשי הלקוח על כל ליד שנכנס" },
];
const CHANS = [
  { k: "email", l: "מייל" },
  { k: "sms", l: "SMS" },
  { k: "whatsapp", l: "וואטסאפ" },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-cyan-500" : "bg-slate-700"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "right-0.5" : "right-[22px]"}`}
      />
    </button>
  );
}

// צד-משרד: מגדיר מה הלקוח *רשאי* להשתמש בו (שכבת "מותר").
export default function MessagingPermsCard({
  clientId,
  allowed,
}: {
  clientId: string;
  allowed: Record<string, boolean>;
}) {
  const [state, setState] = useState<Record<string, boolean>>({ ...allowed });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const set = (k: string, v: boolean) => setState((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      await api(`/api/clients/${clientId}`, {
        method: "PATCH",
        json: {
          messagingAllowed: {
            broadcast: !!state.broadcast,
            leadAlerts: !!state.leadAlerts,
            email: !!state.email,
            sms: !!state.sms,
            whatsapp: !!state.whatsapp,
          },
        },
      });
      setMsg("ההרשאות נשמרו ✓");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="mb-1 text-base font-bold text-slate-100">הרשאות דיוור (מה הלקוח רשאי)</h3>
      <p className="mb-4 text-xs text-slate-500">
        אתה מגדיר מה מותר; הלקוח בוחר להפעיל בהגדרות שלו. אפקטיבי = מותר + הופעל.
      </p>

      <div className="flex flex-col gap-2">
        {CAPS.map((c) => (
          <div
            key={c.k}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200">{c.l}</p>
              <p className="truncate text-[11px] text-slate-500">{c.hint}</p>
            </div>
            <Toggle on={!!state[c.k]} onClick={() => set(c.k, !state[c.k])} />
          </div>
        ))}

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5">
          <p className="mb-2 text-sm font-medium text-slate-200">ערוצים מותרים</p>
          <div className="flex flex-wrap gap-4">
            {CHANS.map((ch) => (
              <label key={ch.k} className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={!!state[ch.k]}
                  onChange={(e) => set(ch.k, e.target.checked)}
                  className="h-4 w-4 accent-cyan-500"
                />
                {ch.l}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" disabled={busy} onClick={save}>
          {busy ? "שומר…" : "שמירת הרשאות"}
        </Button>
        {msg ? <span className="text-xs text-slate-400">{msg}</span> : null}
      </div>
    </Card>
  );
}
