"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Chip } from "@/components/ui";
import { useCollapse, CollapseBtn } from "@/components/settings/Collapse";

// ---------------------------------------------------------------------------
// בריאות מערכת — לוח מנהל: מצב הבדיקה האחרונה, תקלות פתוחות, דופק קרונים
// והיסטוריית ריצות. הבדיקה רצה אוטומטית פעמיים ביום (08:00 + 16:00) ותקלה
// שולחת וואטסאפ + מייל.
// ---------------------------------------------------------------------------

interface HealthResult {
  key: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail?: string;
  ms?: number;
}

interface HealthData {
  lastRun: {
    id: string;
    startedAt: string;
    finishedAt: string | null;
    ok: number;
    warn: number;
    fail: number;
    results: HealthResult[];
  } | null;
  runs: { id: string; startedAt: string; ok: number; warn: number; fail: number }[];
  openIssues: {
    id: string;
    key: string;
    label: string;
    detail: string | null;
    severity: string;
    openedAt: string;
    lastSeenAt: string;
  }[];
  heartbeats: { id: string; lastRunAt: string }[];
}

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  ok: { label: "תקין", color: "#34d399", icon: "✅" },
  warn: { label: "אזהרה", color: "#f59e0b", icon: "⚠️" },
  fail: { label: "תקלה", color: "#f87171", icon: "❌" },
};

const CRON_LABELS: Record<string, string> = {
  reminders: "תזכורות (כל 5 דק')",
  "meta-pull": "משיכת לידים מפייסבוק (כל 5 דק')",
  transcribe: "הקלטות ותמלול (כל 5 דק')",
  sumit: "סנכרון SUMIT (כל 15 דק')",
  health: "בדיקת בריאות (פעמיים ביום)",
  "seo-sync": "סנכרון SEO (יומי)",
};

export default function HealthView() {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [cChecks, tChecks] = useCollapse("health-checks");
  const [cIssues, tIssues] = useCollapse("health-issues");
  const [cCrons, tCrons] = useCollapse("health-crons");
  const [cHistory, tHistory] = useCollapse("health-history");

  const load = useCallback(async () => {
    try {
      const d = await api<HealthData>("/api/admin-ops/health");
      setData(d);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function runNow() {
    setRunning(true);
    setError("");
    try {
      await api("/api/admin-ops/health", { method: "POST" });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const last = data?.lastRun;
  const healthy = last ? last.fail === 0 && last.warn === 0 : null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              🩺 בריאות מערכת{" "}
              {healthy === null ? null : healthy ? (
                <span className="text-emerald-600">— הכל תקין</span>
              ) : (
                <span className="text-red-600">— נמצאו {last!.fail + last!.warn} ממצאים</span>
              )}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              בדיקה מלאה רצה אוטומטית פעמיים ביום (08:00 ו-16:00). תקלה שולחת וואטסאפ + מייל.
              {last ? ` בדיקה אחרונה: ${formatDateTime(last.startedAt)}` : " טרם רצה בדיקה."}
            </p>
          </div>
          <Button disabled={running} onClick={runNow}>
            {running ? "בודק… (עד דקה)" : "הרצת בדיקה עכשיו"}
          </Button>
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </Card>

      {/* תקלות פתוחות */}
      <Card>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-slate-800">
            תקלות פתוחות {data ? `(${data.openIssues.length})` : ""}
          </h3>
          <CollapseBtn collapsed={cIssues} onClick={tIssues} />
        </div>
        {cIssues ? null : !data ? (
          <p className="text-xs text-slate-500">טוען…</p>
        ) : data.openIssues.length === 0 ? (
          <p className="text-xs text-emerald-600">אין תקלות פתוחות ✓</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.openIssues.map((i) => (
              <div key={i.id} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{STATUS_META[i.severity]?.icon ?? "❌"}</span>
                  <span className="text-sm font-medium text-slate-800">{i.label}</span>
                  <span className="mr-auto text-[11px] text-slate-500">
                    נפתחה: {formatDateTime(i.openedAt)}
                  </span>
                </div>
                {i.detail ? <p className="mt-1 text-xs text-slate-600">{i.detail}</p> : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* תוצאות הבדיקה האחרונה */}
      <Card>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-slate-800">
            הבדיקה האחרונה{" "}
            {last ? (
              <span className="text-xs font-normal text-slate-500">
                ✅ {last.ok} · ⚠️ {last.warn} · ❌ {last.fail}
              </span>
            ) : null}
          </h3>
          <CollapseBtn collapsed={cChecks} onClick={tChecks} />
        </div>
        {cChecks ? null : !last ? (
          <p className="text-xs text-slate-500">טרם רצה בדיקה — לחצו למעלה על ״הרצת בדיקה עכשיו״.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-400">
                  <th className="py-2 pe-2 font-medium">בדיקה</th>
                  <th className="py-2 pe-2 font-medium">מצב</th>
                  <th className="py-2 pe-2 font-medium">פירוט</th>
                  <th className="py-2 font-medium">משך</th>
                </tr>
              </thead>
              <tbody>
                {last.results.map((r) => {
                  const meta = STATUS_META[r.status];
                  return (
                    <tr key={r.key} className="border-b border-slate-100">
                      <td className="py-2 pe-2 font-medium text-slate-700">{r.label}</td>
                      <td className="py-2 pe-2">
                        <Chip color={meta.color}>{meta.label}</Chip>
                      </td>
                      <td className="py-2 pe-2 text-xs text-slate-500">{r.detail ?? "—"}</td>
                      <td className="py-2 text-xs text-slate-400">{r.ms != null ? `${r.ms}ms` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* דופק קרונים */}
      <Card>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-slate-800">דופק קרונים</h3>
          <CollapseBtn collapsed={cCrons} onClick={tCrons} />
        </div>
        {cCrons ? null : !data || data.heartbeats.length === 0 ? (
          <p className="text-xs text-slate-500">
            טרם נרשם דופק — נרשם אוטומטית מהריצה הראשונה של כל קרון אחרי הפריסה.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.heartbeats.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                <span className="font-medium text-slate-700">{CRON_LABELS[h.id] ?? h.id}</span>
                <span className="mr-auto text-xs text-slate-500">
                  ריצה אחרונה: {formatDateTime(h.lastRunAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* היסטוריית ריצות */}
      <Card>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-slate-800">היסטוריית בדיקות</h3>
          <CollapseBtn collapsed={cHistory} onClick={tHistory} />
        </div>
        {cHistory ? null : !data || data.runs.length === 0 ? (
          <p className="text-xs text-slate-500">אין היסטוריה עדיין.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {data.runs.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-1.5 text-xs hover:bg-slate-50">
                <span className="text-slate-600">{formatDateTime(r.startedAt)}</span>
                <span className="text-emerald-600">✅ {r.ok}</span>
                {r.warn > 0 ? <span className="text-amber-600">⚠️ {r.warn}</span> : null}
                {r.fail > 0 ? <span className="text-red-600">❌ {r.fail}</span> : null}
                {r.warn === 0 && r.fail === 0 ? <Chip color="#34d399">תקין</Chip> : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
