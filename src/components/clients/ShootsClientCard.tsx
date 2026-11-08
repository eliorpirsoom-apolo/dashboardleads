"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui";
import { useCollapse, CollapseBtn } from "@/components/settings/Collapse";
import { shootStatusMeta, shootTypeLabel } from "@/lib/shoots";

interface Shoot {
  id: string;
  title: string | null;
  date: string;
  status: string;
  project: { name: string } | null;
  location: string | null;
  types: string[];
  crew: { name: string }[];
}

// כרטיס ימי צילום בעמוד הלקוח (צד משרד) — תצוגה מהירה + קישור לניהול המלא.
export default function ShootsClientCard({ clientId }: { clientId: string }) {
  const [collapsed, toggle] = useCollapse(`shoots-${clientId}`);
  const [shoots, setShoots] = useState<Shoot[] | null>(null);

  useEffect(() => {
    api<{ shoots: Shoot[] }>(`/api/shoots?clientId=${clientId}`)
      .then((d) => setShoots(d.shoots))
      .catch(() => setShoots([]));
  }, [clientId]);

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-800">🎬 ימי צילום{shoots ? ` · ${shoots.length}` : ""}</h3>
        <div className="flex items-center gap-2">
          <Link href="/admin/shoots" className="text-xs font-medium text-[#3a5bd9] hover:underline">ניהול ←</Link>
          <CollapseBtn collapsed={collapsed} onClick={toggle} />
        </div>
      </div>
      {collapsed ? null : shoots === null ? (
        <p className="text-xs text-slate-400">טוען…</p>
      ) : shoots.length === 0 ? (
        <p className="text-xs text-slate-400">אין ימי צילום ללקוח זה עדיין.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {shoots.map((s) => {
            const meta = shootStatusMeta(s.status);
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-700">{s.title || "יום צילום"}</span>
                <span className="text-xs text-slate-500">📅 {formatDateTime(s.date)}</span>
                {s.project ? <span className="text-[11px] text-slate-400">{s.project.name}</span> : null}
                {s.types.length > 0 ? (
                  <span className="text-[11px] text-slate-400">{s.types.map(shootTypeLabel).join(", ")}</span>
                ) : null}
                {s.crew.length > 0 ? <span className="text-[11px] text-slate-400">👥 {s.crew.map((c) => c.name).join(", ")}</span> : null}
                <span className="mr-auto rounded-md px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: meta.color }}>
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
