"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Chip, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface Source {
  id: string;
  name: string;
  kind: string;
  active: boolean;
  lastSeenAt: string | null;
  _count: { leads: number };
  project: { id: string; name: string } | null;
  metaPage: { id: string } | null;
}

interface ProjectOpt {
  id: string;
  name: string;
  status: string;
}

const KIND_META: Record<string, { label: string; icon: string }> = {
  call: { label: "טלפון", icon: "phone" },
  form: { label: "טופס / אתר", icon: "link" },
  whatsapp: { label: "וואטסאפ", icon: "whatsapp" },
};

// מבט-על של חיבורי הלקוח, מקובצים לפי פרויקט. הניהול (יצירה/כיבוי/העתקת
// כתובת) נעשה מעמוד הפרויקט; כאן רק תמונה כוללת + שיוך מקורות ישנים.
export default function ClientConnectionsOverview({ clientId }: { clientId: string }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        api<{ sources: Source[] }>(`/api/sources?clientId=${clientId}`),
        api<{ projects: ProjectOpt[] }>(`/api/projects?clientId=${clientId}`),
      ]);
      setSources(s.sources);
      setProjects(p.projects.filter((x) => x.status === "active"));
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId]);
  useEffect(() => {
    load();
  }, [load]);

  async function assign(sourceId: string, projectId: string) {
    if (!projectId) return;
    try {
      await api(`/api/sources/${sourceId}`, { method: "PATCH", json: { projectId } });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  // לקוח בלי פרויקטים — יצירת "פרויקט כללי" בלחיצה כדי שיהיה לאן לשייך.
  async function createGeneralProject() {
    setBusy(true);
    setError("");
    try {
      await api("/api/projects", { method: "POST", json: { clientId, name: "כללי" } });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // מקור של חיבור פייסבוק חי ברמת הלקוח בכוונה — מנוהל בכרטיס הפייסבוק למעלה.
  const unassigned = sources.filter((s) => !s.project && !s.metaPage);
  const byProject = projects
    .map((p) => ({ project: p, list: sources.filter((s) => s.project?.id === p.id) }))
    .filter((g) => g.list.length > 0);
  // פרויקטים לא-פעילים עם מקורות — עדיין מציגים (שלא ייעלמו חיבורים חיים).
  const orphanProjects = new Map<string, { name: string; list: Source[] }>();
  for (const s of sources) {
    if (s.project && !projects.some((p) => p.id === s.project!.id)) {
      const cur = orphanProjects.get(s.project.id) ?? { name: s.project.name, list: [] };
      cur.list.push(s);
      orphanProjects.set(s.project.id, cur);
    }
  }

  function SourceRow({ s }: { s: Source }) {
    const meta = KIND_META[s.kind] ?? KIND_META.form;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
        <Icon name={meta.icon} className="h-4 w-4 text-cyan-500" />
        <span className="font-medium text-slate-700">{s.name}</span>
        <span className="text-[11px] text-slate-400">{meta.label}</span>
        {!s.active ? <Chip color="#f87171">כבוי</Chip> : null}
        <span className="mr-auto text-xs text-slate-500">
          {s._count.leads} לידים
          {s.lastSeenAt ? ` · ${formatDateTime(s.lastSeenAt)}` : ""}
        </span>
      </div>
    );
  }

  return (
    <Card>
      <h3 className="mb-1 text-base font-bold text-slate-800">חיבורים (Webhooks) — לפי פרויקט</h3>
      <p className="mb-4 text-xs text-slate-500">
        טלפונים, טפסים ואתרים מחוברים ברמת הפרויקט. יצירה וניהול (כתובת, כיבוי) —
        מתוך עמוד הפרויקט. כאן רואים את התמונה הכוללת של הלקוח.
      </p>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      {/* מקורות ישנים ללא פרויקט — כלי השיוך */}
      {unassigned.length > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="mb-1 text-sm font-bold text-amber-800">
            ⚠️ {unassigned.length} חיבורים ללא פרויקט — יש לשייך
          </p>
          <p className="mb-2 text-[11px] text-amber-700">
            החיבורים ממשיכים לעבוד כרגיל, אבל הלידים מהם לא נכנסים לאף פרויקט (ולא
            מגיעים למשווק). שיוך לא משנה את כתובת ה-Webhook.
          </p>
          {projects.length === 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-amber-800">ללקוח אין פרויקט פעיל.</span>
              <Button size="sm" disabled={busy} onClick={createGeneralProject}>
                {busy ? "יוצר…" : 'יצירת פרויקט "כללי"'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {unassigned.map((s) => {
                const meta = KIND_META[s.kind] ?? KIND_META.form;
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-sm">
                    <Icon name={meta.icon} className="h-4 w-4 text-cyan-500" />
                    <span className="font-medium text-slate-700">{s.name}</span>
                    <span className="text-xs text-slate-500">{s._count.leads} לידים</span>
                    <div className="mr-auto">
                      <Select
                        value=""
                        onChange={(e) => assign(s.id, e.target.value)}
                        className="!w-44 !py-1 text-xs"
                        title="שיוך לפרויקט"
                      >
                        <option value="">בחירת פרויקט…</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* חיבורים לפי פרויקט */}
      <div className="flex flex-col gap-3">
        {byProject.map(({ project, list }) => (
          <div key={project.id} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-700">📁 {project.name}</p>
              <Link
                href={`/admin/clients/${clientId}/projects/${project.id}`}
                className="text-xs font-medium text-[#3a5bd9] hover:underline"
              >
                ניהול החיבורים ←
              </Link>
            </div>
            <div className="flex flex-col divide-y divide-slate-100">
              {list.map((s) => (
                <SourceRow key={s.id} s={s} />
              ))}
            </div>
          </div>
        ))}
        {[...orphanProjects.entries()].map(([pid, g]) => (
          <div key={pid} className="rounded-xl border border-slate-200 p-3 opacity-70">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-500">📁 {g.name} (לא פעיל)</p>
              <Link
                href={`/admin/clients/${clientId}/projects/${pid}`}
                className="text-xs font-medium text-[#3a5bd9] hover:underline"
              >
                ניהול החיבורים ←
              </Link>
            </div>
            <div className="flex flex-col divide-y divide-slate-100">
              {g.list.map((s) => (
                <SourceRow key={s.id} s={s} />
              ))}
            </div>
          </div>
        ))}
        {byProject.length === 0 && orphanProjects.size === 0 && unassigned.length === 0 ? (
          <p className="text-xs text-slate-500">
            אין חיבורים עדיין — נכנסים לעמוד פרויקט ויוצרים שם את החיבור הראשון.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
