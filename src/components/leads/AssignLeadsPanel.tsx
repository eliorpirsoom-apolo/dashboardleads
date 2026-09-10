"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Field, Select } from "@/components/ui";

// שיוך המוני של לידים לפרויקט ולמשווק — בעיקר אחרי ייבוא מקובץ, כשהלידים
// נכנסו לטבלה בלי פרויקט (ואז סוכן לא רואה אותם) ובלי מטפל.
// הלידים מקובצים לפי "ערוץ"/קמפיין מהקובץ; לכל קבוצה נבחר פרויקט (הצעה
// אוטומטית לפי שם הפרויקט) ומשווק. הביצוע דרך /api/leads/bulk — שקט
// (בלי וואטסאפ למשווק) ובלי לגעת בתאריך הקליטה.

type Lead = {
  id: string;
  number: number;
  fullName: string | null;
  channel: string | null;
  campaignLabel: string | null;
  projectId: string | null;
  assigneeId: string | null;
  receivedAt: string;
};
type Project = { id: string; name: string; primaryAgentId: string | null };
type Agent = { id: string; name: string };

type Group = {
  key: string;
  leads: Lead[];
  needProject: number;
  needAssignee: number;
  from: string;
  to: string;
};

const NONE = "";

function tokens(name: string): string[] {
  return name.split(/[\s\-–—/|,]+/).map((t) => t.trim()).filter((t) => t.length >= 3);
}

export default function AssignLeadsPanel({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clientName, setClientName] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [choice, setChoice] = useState<Record<string, { projectId: string; agentId: string }>>({});
  const [defaultAgent, setDefaultAgent] = useState(NONE);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ project: number; assignee: number } | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [cj, pj] = await Promise.all([
        fetch(`/api/clients/${clientId}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/projects?clientId=${clientId}`, { cache: "no-store" }).then((r) => r.json()),
      ]);
      setClientName(cj.client?.name ?? "");
      const ag: Agent[] = (cj.client?.users ?? [])
        .filter((u: any) => u.active !== false)
        .map((u: any) => ({ id: u.id, name: u.name + (u.isAgent ? "" : " (בעלים)") }));
      setAgents(ag);
      // המשווק הראשי של כל פרויקט — ברירת המחדל לשיוך.
      const projs: Project[] = [];
      for (const p of pj.projects ?? []) {
        let primary: string | null = null;
        try {
          const d = await fetch(`/api/projects/${p.id}`, { cache: "no-store" }).then((r) => r.json());
          const asg = d.project?.assignments ?? [];
          primary = (asg.find((a: any) => a.isPrimary) ?? asg[0])?.userId ?? null;
        } catch {
          /* בלי שיוכים — נשאיר ריק */
        }
        projs.push({ id: p.id, name: p.name, primaryAgentId: primary });
      }
      setProjects(projs);
      // כל הלידים הפעילים של הלקוח (עד 2000).
      const all: Lead[] = [];
      for (let page = 1; page <= 10; page++) {
        const j = await fetch(`/api/leads?clientId=${clientId}&pageSize=200&page=${page}`, {
          cache: "no-store",
        }).then((r) => r.json());
        const rows: Lead[] = j.rows ?? [];
        all.push(...rows);
        if (rows.length < 200) break;
      }
      // הגנה מכפילות בין עמודים (תאריכים זהים בייבוא).
      const seen = new Set<string>();
      setLeads(all.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true))));
      if (ag.length === 1) setDefaultAgent(ag[0].id);
    } catch (e) {
      setError((e as Error).message || "טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // קיבוץ הלידים שחסר להם פרויקט או מטפל — לפי הערוץ/הקמפיין מהקובץ.
  const groups: Group[] = useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const l of leads) {
      if (l.projectId && l.assigneeId) continue;
      const key = (l.channel || l.campaignLabel || "ללא ערוץ").trim();
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(l);
    }
    return [...m.entries()]
      .map(([key, ls]) => {
        const dates = ls.map((l) => l.receivedAt).sort();
        return {
          key,
          leads: ls,
          needProject: ls.filter((l) => !l.projectId).length,
          needAssignee: ls.filter((l) => !l.assigneeId).length,
          from: dates[0]?.slice(0, 10) ?? "",
          to: dates[dates.length - 1]?.slice(0, 10) ?? "",
        };
      })
      .sort((a, b) => b.leads.length - a.leads.length);
  }, [leads]);

  // הצעה אוטומטית: מילה ייחודית משם הפרויקט שמופיעה בשם הקבוצה.
  useEffect(() => {
    if (!projects.length || !groups.length) return;
    const counts = new Map<string, number>();
    for (const p of projects) for (const t of new Set(tokens(p.name))) counts.set(t, (counts.get(t) ?? 0) + 1);
    const unique = (p: Project) => tokens(p.name).filter((t) => counts.get(t) === 1);
    setChoice((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        if (next[g.key]) continue;
        const hit = projects.find((p) => unique(p).some((t) => g.key.includes(t)));
        // קבוצה שכל הלידים שלה כבר בפרויקט אחד — נציע אותו (רק המטפל חסר).
        const existing = g.needProject === 0 ? g.leads[0]?.projectId ?? "" : "";
        const projectId = hit?.id ?? existing;
        const proj = projects.find((p) => p.id === projectId);
        next[g.key] = { projectId, agentId: proj?.primaryAgentId ?? defaultAgent };
      }
      return next;
    });
  }, [groups, projects, defaultAgent]);

  function setGroup(key: string, patch: Partial<{ projectId: string; agentId: string }>) {
    setChoice((prev) => {
      const cur = prev[key] ?? { projectId: NONE, agentId: NONE };
      const next = { ...cur, ...patch };
      // בחירת פרויקט מציבה את המשווק הראשי שלו אם עוד לא נבחר משווק.
      if (patch.projectId && !cur.agentId) {
        next.agentId = projects.find((p) => p.id === patch.projectId)?.primaryAgentId ?? defaultAgent;
      }
      return { ...prev, [key]: next };
    });
  }

  const plan = useMemo(() => {
    let project = 0;
    let assignee = 0;
    for (const g of groups) {
      const c = choice[g.key];
      if (!c) continue;
      if (c.projectId) project += g.leads.filter((l) => l.projectId !== c.projectId).length;
      if (c.agentId) assignee += g.leads.filter((l) => !l.assigneeId).length;
    }
    return { project, assignee };
  }, [groups, choice]);

  async function bulk(action: "set_project" | "assign", ids: string[], extra: Record<string, string>) {
    let affected = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const res = await fetch("/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, ids: ids.slice(i, i + 200), action, ...extra }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `שגיאה ${res.status}`);
      affected += j.affected ?? 0;
      setProgress(`${action === "set_project" ? "שיוך לפרויקט" : "שיוך למטפל"}: ${affected}/${ids.length}`);
    }
    return affected;
  }

  async function run() {
    if (running) return;
    if (!plan.project && !plan.assignee) return;
    if (!confirm(`לשייך ${plan.project} לידים לפרויקט ו-${plan.assignee} לידים למטפל? (בלי התראות, התאריכים נשמרים)`)) return;
    setRunning(true);
    setError("");
    setResult(null);
    try {
      let project = 0;
      let assignee = 0;
      for (const g of groups) {
        const c = choice[g.key];
        if (!c) continue;
        if (c.projectId) {
          const ids = g.leads.filter((l) => l.projectId !== c.projectId).map((l) => l.id);
          if (ids.length) project += await bulk("set_project", ids, { projectId: c.projectId });
        }
        if (c.agentId) {
          const ids = g.leads.filter((l) => !l.assigneeId).map((l) => l.id);
          if (ids.length) assignee += await bulk("assign", ids, { assigneeId: c.agentId });
        }
      }
      setResult({ project, assignee });
      await load();
    } catch (e) {
      setError((e as Error).message || "השיוך נכשל");
    } finally {
      setRunning(false);
      setProgress("");
    }
  }

  if (loading) return <div className="text-sm text-slate-400">טוען לידים…</div>;

  const pending = groups.reduce((n, g) => n + g.leads.length, 0);

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      ) : null}
      {result ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✓ שויכו {result.project} לידים לפרויקט ו-{result.assignee} לידים למטפל. תאריכי הקליטה לא השתנו.
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grow">
            <div className="text-sm font-semibold text-slate-700">{clientName}</div>
            <div className="text-xs text-slate-400">
              {pending
                ? `${pending} לידים בלי פרויקט או בלי מטפל, ב-${groups.length} קבוצות לפי ערוץ`
                : "כל הלידים משויכים לפרויקט ולמטפל ✓"}
            </div>
          </div>
          <div className="w-56">
            <Field label="משווק ברירת מחדל">
              <Select
                value={defaultAgent}
                onChange={(e) => {
                  const v = e.target.value;
                  setDefaultAgent(v);
                  setChoice((prev) => {
                    const next = { ...prev };
                    for (const k of Object.keys(next)) if (!next[k].agentId) next[k] = { ...next[k], agentId: v };
                    return next;
                  });
                }}
              >
                <option value="">— ללא —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Button onClick={run} disabled={running || (!plan.project && !plan.assignee)}>
            {running ? progress || "מבצע…" : `בצע שיוך (${plan.project} לפרויקט · ${plan.assignee} למטפל)`}
          </Button>
        </div>
      </Card>

      {groups.length ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-right">ערוץ / קמפיין מהקובץ</th>
                <th className="px-3 py-2 text-right">לידים</th>
                <th className="px-3 py-2 text-right">תאריכים</th>
                <th className="px-3 py-2 text-right">פרויקט</th>
                <th className="px-3 py-2 text-right">מטפל</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const c = choice[g.key] ?? { projectId: NONE, agentId: NONE };
                return (
                  <tr key={g.key} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-700">{g.key}</div>
                      <div className="text-xs text-slate-400">
                        {g.leads.slice(0, 3).map((l) => `#${l.number}`).join(" · ")}
                        {g.leads.length > 3 ? " …" : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="font-semibold text-slate-700">{g.leads.length}</div>
                      <div className="text-xs text-slate-400">
                        {g.needProject ? `${g.needProject} בלי פרויקט` : ""}
                        {g.needProject && g.needAssignee ? " · " : ""}
                        {g.needAssignee ? `${g.needAssignee} בלי מטפל` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                      {g.from}{g.to !== g.from ? ` — ${g.to}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      <Select value={c.projectId} onChange={(e) => setGroup(g.key, { projectId: e.target.value })}>
                        <option value="">— לא לשנות —</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Select value={c.agentId} onChange={(e) => setGroup(g.key, { agentId: e.target.value })}>
                        <option value="">— לא לשנות —</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-xs text-slate-400">
        השיוך משנה רק פרויקט ומטפל — תאריך הקליטה, הסטטוס וההערות נשארים כמו שהם, ולא נשלחות התראות וואטסאפ.
        סוכן רואה רק לידים של הפרויקטים שלו, לכן ליד בלי פרויקט לא יופיע אצלו גם אם הוא המטפל.
      </p>
    </div>
  );
}
