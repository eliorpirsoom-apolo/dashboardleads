"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { CHANNELS } from "@/lib/defaults";
import { Button, Card, Chip, Field, Input, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface Source {
  id: string;
  name: string;
  token: string;
  channel: string | null;
  platform: string | null;
  kind: string;
  active: boolean;
  lastSeenAt: string | null;
  _count: { leads: number };
}

// Agency-side: manage intake endpoints (webhook URLs for Make/Zapier/Elementor).
export default function SourcesManager({ clientId }: { clientId: string }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("");
  const [kind, setKind] = useState("form");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ sources: Source[] }>(`/api/sources?clientId=${clientId}`);
      setSources(d.sources);
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/sources", {
        method: "POST",
        json: { clientId, name, channel: channel || null, kind },
      });
      setName("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function webhookUrl(token: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/api/intake/${token}`;
  }

  async function copy(token: string) {
    await navigator.clipboard.writeText(webhookUrl(token));
    setCopied(token);
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <Card>
      <h3 className="mb-1 text-base font-bold text-slate-100">מקורות קליטה (Webhooks)</h3>
      <p className="mb-4 text-xs text-slate-500">
        לכל מקור כתובת ייחודית. מדביקים אותה ב-Make / Zapier / טופס אלמנטור — והלידים
        נכנסים ישר למערכת. GET לכתובת בודק חיבור; POST עם JSON יוצר ליד.
      </p>

      {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}

      <div className="flex flex-col gap-2">
        {sources.map((s) => (
          <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Icon
                name={s.kind === "call" ? "phone" : s.kind === "whatsapp" ? "whatsapp" : "link"}
                className="h-4 w-4 text-cyan-400"
              />
              <span className="text-sm font-medium text-slate-200">{s.name}</span>
              {!s.active ? <Chip color="#f87171">כבוי</Chip> : null}
              <span className="text-xs text-slate-500">
                {s._count.leads} לידים
                {s.lastSeenAt ? ` · נראה לאחרונה ${formatDateTime(s.lastSeenAt)}` : " · טרם התקבלו לידים"}
              </span>
              <div className="mr-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => copy(s.token)}>
                  {copied === s.token ? "הועתק ✓" : "העתקת כתובת"}
                </Button>
                <button
                  onClick={async () => {
                    await api(`/api/sources/${s.id}`, { method: "PATCH", json: { active: !s.active } });
                    load();
                  }}
                  className="rounded p-1.5 text-slate-500 hover:text-amber-300"
                  title={s.active ? "כיבוי" : "הפעלה"}
                >
                  <Icon name={s.active ? "x" : "check"} className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p dir="ltr" className="mt-2 truncate rounded-lg bg-slate-950/80 px-2 py-1 font-mono text-[11px] text-slate-400">
              {webhookUrl(s.token)}
            </p>
          </div>
        ))}
        {sources.length === 0 ? (
          <p className="text-xs text-slate-600">אין מקורות עדיין — צרו את הראשון למטה.</p>
        ) : null}
      </div>

      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-800 pt-4">
        <div className="min-w-[160px] flex-1">
          <Field label="שם המקור">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='למשל: "פייסבוק לידים — קמפיין השקה"' required />
          </Field>
        </div>
        <div className="w-36">
          <Field label="ערוץ ברירת מחדל">
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">—</option>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-36">
          <Field label="סוג לידים">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="form">טופס</option>
              <option value="call">שיחות (פייקול)</option>
              <option value="whatsapp">וואטסאפ</option>
            </Select>
          </Field>
        </div>
        <Button type="submit" disabled={busy}>
          <Icon name="plus" className="h-4 w-4" />
          יצירת מקור
        </Button>
      </form>
    </Card>
  );
}
