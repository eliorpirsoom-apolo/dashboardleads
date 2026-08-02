"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatCurrency, formatDate } from "@/lib/format";
import { Chip, EmptyState, Field, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface RequestRow {
  id: string;
  status: string;
  amount: number | null;
  notes: string | null;
  createdAt: string;
  lead: { id: string; fullName: string | null; number: number; phone: string | null } | null;
  project: { id: string; name: string } | null;
  unitType: { id: string; name: string } | null;
}

const STATUSES = [
  { value: "new", label: "חדשה", color: "#38bdf8" },
  { value: "approved", label: "אושרה", color: "#34d399" },
  { value: "rejected", label: "נדחתה", color: "#f87171" },
  { value: "converted", label: "הפכה לחוזה", color: "#fbbf24" },
];

export default function PurchasesView({ clientId }: { clientId: string }) {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ clientId });
      if (filter) p.set("status", filter);
      const d = await api<{ requests: RequestRow[] }>(`/api/purchase-requests?${p}`);
      setRequests(d.requests);
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId, filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    try {
      await api(`/api/purchase-requests/${id}`, { method: "PATCH", json: { status } });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="glass flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div className="w-40">
          <Field label="סטטוס בקשה">
            <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">הכול</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="mr-auto text-xs text-slate-500">
          בקשת רכישה חדשה נפתחת מתוך כרטיס ליד (כפתור &quot;בקשת רכישה&quot;).
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {requests.length === 0 ? (
        <div className="glass rounded-2xl p-2">
          <EmptyState icon="money" title="אין בקשות רכישה" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((r) => (
            <div key={r.id} className="glass flex flex-wrap items-center gap-3 rounded-xl px-4 py-3">
              <Icon name="money" className="h-4 w-4 text-amber-700" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700">
                  {r.lead ? `${r.lead.fullName ?? "—"} (ליד #${r.lead.number})` : "ללא ליד"}
                </p>
                <p className="text-xs text-slate-500">
                  {r.project?.name ?? ""}
                  {r.unitType ? ` · ${r.unitType.name}` : ""}
                  {r.lead?.phone ? ` · ${r.lead.phone}` : ""}
                  {r.notes ? ` · ${r.notes}` : ""}
                </p>
              </div>
              {r.amount ? (
                <span className="text-sm font-bold text-amber-700">{formatCurrency(r.amount)}</span>
              ) : null}
              <select
                value={r.status}
                onChange={(e) => setStatus(r.id, e.target.value)}
                className="rounded-lg border bg-transparent px-2 py-1 text-xs font-medium outline-none"
                style={{
                  color: STATUSES.find((s) => s.value === r.status)?.color,
                  borderColor: `${STATUSES.find((s) => s.value === r.status)?.color}66`,
                }}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value} style={{ color: "#0f172a" }}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-slate-600">{formatDate(r.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
