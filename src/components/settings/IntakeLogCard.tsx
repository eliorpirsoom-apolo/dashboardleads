"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Chip, Field, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { useCollapse, CollapseBtn } from "@/components/settings/Collapse";

interface IntakeLogRow {
  id: string;
  status: string;
  leadId: string | null;
  error: string | null;
  payload: string | null;
  createdAt: string;
  source: { name: string; kind: string } | null;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  ok: { label: "נקלט", color: "#34d399" },
  duplicate: { label: "כפול (דולג)", color: "#fbbf24" },
  rejected: { label: "נדחה", color: "#f87171" },
  error: { label: "שגיאה", color: "#f87171" },
};

// יומן הקליטה — כל מה שניסה להיכנס דרך ה-webhooks, כולל מה שנכשל ולמה.
export default function IntakeLogCard({ clientId }: { clientId: string }) {
  const [logs, setLogs] = useState<IntakeLogRow[]>([]);
  const [collapsed, toggleCollapse] = useCollapse("client-intake-log");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ clientId, page: String(page) });
      if (status) p.set("status", status);
      const d = await api<{ logs: IntakeLogRow[]; total: number }>(`/api/intake-logs?${p}`);
      setLogs(d.logs);
      setTotal(d.total);
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId, page, status]);

  useEffect(() => {
    load();
  }, [load]);

  // יצירת ליד ידנית מקליטה שנכשלה — ממפה את הפיילוד למה שאפשר.
  async function createFromPayload(log: IntakeLogRow) {
    if (!log.payload) return;
    setBusy(true);
    try {
      const payload = JSON.parse(log.payload);
      const grab = (...keys: string[]) => {
        for (const k of keys) {
          const hit = Object.keys(payload).find(
            (pk) => pk.toLowerCase().trim() === k
          );
          if (hit && payload[hit]) return String(payload[hit]);
        }
        return undefined;
      };
      await api("/api/leads", {
        method: "POST",
        json: {
          clientId,
          fullName: grab("name", "fullname", "full_name", "שם", "שם מלא"),
          phone: grab("phone", "טלפון", "tel", "mobile", "caller", "from"),
          email: grab("email", "מייל", "אימייל", "mail"),
          city: grab("city", "עיר"),
          campaignLabel: grab("campaign", "קמפיין", "utm_campaign"),
        },
      });
      alert("ליד נוצר ידנית מהקליטה ✓");
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / 30));

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-800">יומן קליטה</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            כל בקשה שהגיעה ל-webhooks של הלקוח — כולל דחיות, כפולים ושגיאות.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-40">
            <Field label="סינון">
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="">הכול ({total})</option>
                {Object.entries(STATUS_META).map(([v, m]) => (
                  <option key={v} value={v}>{m.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <CollapseBtn collapsed={collapsed} onClick={toggleCollapse} />
        </div>
      </div>

      {collapsed ? null : (<>
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

      {logs.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-600">אין רשומות קליטה עדיין.</p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-200">
          {logs.map((log) => (
            <div key={log.id}>
              <button
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                className="flex w-full flex-wrap items-center gap-2 px-1 py-2 text-right transition hover:bg-slate-100/30"
              >
                <Chip color={STATUS_META[log.status]?.color ?? "#64748b"}>
                  {STATUS_META[log.status]?.label ?? log.status}
                </Chip>
                <span className="text-xs text-slate-400">{log.source?.name ?? "מקור נמחק"}</span>
                {log.error ? (
                  <span className="max-w-[280px] truncate text-xs text-red-600/80">{log.error}</span>
                ) : null}
                <span className="mr-auto text-[11px] text-slate-600">{formatDateTime(log.createdAt)}</span>
              </button>
              {expanded === log.id ? (
                <div className="mb-2 rounded-lg bg-slate-50 p-3">
                  <pre dir="ltr" className="thin-scroll max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-400">
                    {log.payload ?? "(ללא פיילוד)"}
                  </pre>
                  {(log.status === "rejected" || log.status === "error") && log.payload ? (
                    <Button size="sm" variant="ghost" className="mt-2" disabled={busy} onClick={() => createFromPayload(log)}>
                      <Icon name="plus" className="h-3.5 w-3.5" />
                      צור ליד ידנית מהנתונים
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {pages > 1 ? (
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>הקודם</Button>
          <span className="self-center text-xs text-slate-500">{page}/{pages}</span>
          <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>הבא</Button>
        </div>
      ) : null}
      </>)}
    </Card>
  );
}
