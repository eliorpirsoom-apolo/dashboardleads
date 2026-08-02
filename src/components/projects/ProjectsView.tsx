"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { formatCurrency } from "@/lib/format";
import { Button, Card, Chip, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  leads: number;
  contracts: number;
  contractsValue: number;
  totalUnits: number;
  soldUnits: number;
  unitTypes: number;
  agents: { userId: string; name: string; active: boolean; isPrimary: boolean }[];
}

export default function ProjectsView({
  clientId,
  baseHref,
  isRealestate = true,
}: {
  clientId: string;
  baseHref: string; // "/app/projects" | "/admin/clients/<id>/projects"
  isRealestate?: boolean; // false → כללי: בלי מלאי דירות וחוזים
}) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ projects: ProjectRow[] }>(`/api/projects?clientId=${clientId}`);
      setProjects(d.projects);
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}>
          <Icon name="plus" className="h-4 w-4" />
          פרויקט חדש
        </Button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {projects.length === 0 ? (
        <div className="glass rounded-2xl p-2">
          <EmptyState
            icon="building"
            title="אין פרויקטים עדיין"
            hint={
              isRealestate
                ? "הקימו פרויקט: שם, טיפוסי דירות, מלאי ומחירים — ומתחילים לנהל."
                : "הקימו פרויקט: לכל פרויקט מקורות קליטה, אנשי מכירות ולידים משלו."
            }
            action={
              <Button onClick={() => setShowCreate(true)}>
                <Icon name="plus" className="h-4 w-4" />
                הקמת פרויקט
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => {
            const available = p.totalUnits - p.soldUnits;
            const pct = p.totalUnits > 0 ? Math.round((p.soldUnits / p.totalUnits) * 100) : 0;
            return (
              <Link key={p.id} href={`${baseHref}/${p.id}`}>
                <Card className="glass-hover h-full">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-700">
                        <Icon name="building" className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{p.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {isRealestate ? `${p.unitTypes} טיפוסים · ` : ""}
                          {p.leads} לידים
                        </p>
                      </div>
                    </div>
                    {p.status !== "active" ? (
                      <Chip color="#94a3b8">{p.status === "done" ? "הסתיים" : "ארכיון"}</Chip>
                    ) : null}
                  </div>

                  {p.agents.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">אנשי מכירות:</span>
                      {p.agents.map((a) => (
                        <Chip key={a.userId} color={a.isPrimary ? "#22d3ee" : "#64748b"}>
                          {a.name}
                          {a.isPrimary ? " ★" : ""}
                        </Chip>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] text-slate-600">
                      אין אנשי מכירות משויכים — לידים ייכנסו ללא מטפל
                    </p>
                  )}

                  {isRealestate ? (
                    <>
                      <div className="mt-4">
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-slate-400">
                            נמכרו {p.soldUnits} מתוך {p.totalUnits}
                          </span>
                          <span className="font-bold text-cyan-700">{pct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-l from-cyan-400 to-indigo-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-slate-50 py-2">
                          <p className="text-base font-bold text-emerald-700">{available}</p>
                          <p className="text-[10px] text-slate-500">זמינות</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 py-2">
                          <p className="text-base font-bold text-slate-700">{p.contracts}</p>
                          <p className="text-[10px] text-slate-500">חוזים</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 py-2">
                          <p className="text-base font-bold text-amber-700">
                            {p.contractsValue ? formatCurrency(p.contractsValue) : "—"}
                          </p>
                          <p className="text-[10px] text-slate-500">ערך חוזים</p>
                        </div>
                      </div>
                    </>
                  ) : null}
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {showCreate ? (
        <CreateProjectModal
          clientId={clientId}
          isRealestate={isRealestate}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

interface UnitDraft {
  name: string;
  rooms: string;
  price: string;
  totalUnits: string;
}

function CreateProjectModal({
  clientId,
  isRealestate,
  onClose,
  onCreated,
}: {
  clientId: string;
  isRealestate: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [materialTemplateId, setMaterialTemplateId] = useState("");
  const [templates, setTemplates] = useState<{ id: string; name: string; items: string[] }[]>([]);
  const [units, setUnits] = useState<UnitDraft[]>([
    { name: "", rooms: "", price: "", totalUnits: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ templates: { id: string; name: string; items: string[] }[] }>("/api/material-templates")
      .then((d) => setTemplates(d.templates))
      .catch(() => {});
  }, []);

  function setUnit(i: number, patch: Partial<UnitDraft>) {
    setUnits(units.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/projects", {
        method: "POST",
        json: {
          clientId,
          name,
          description: description || null,
          materialTemplateId: materialTemplateId || null,
          unitTypes: units
            .filter((u) => u.name.trim())
            .map((u) => ({
              name: u.name.trim(),
              rooms: u.rooms ? Number(u.rooms) : null,
              price: Number(u.price) || 0,
              totalUnits: Number(u.totalUnits) || 0,
            })),
        },
      });
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="הקמת פרויקט" onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Field label="שם הפרויקט">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='למשל: "מגדלי הפארק — הרצליה"' required />
        </Field>
        <Field label="תיאור (אופציונלי)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <Field label="רשימת חומרים לשליחה ללקוח (אופציונלי)">
          <Select value={materialTemplateId} onChange={(e) => setMaterialTemplateId(e.target.value)}>
            <option value="">— בלי שליחת חומרים —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.items.length} פריטים)
              </option>
            ))}
          </Select>
          {materialTemplateId ? (
            <p className="mt-1 text-[11px] text-cyan-400/80">
              ✉️ בפתיחת הפרויקט תישלח ללקוח בקשת החומרים אוטומטית, עם תזכורות עד קבלה.
            </p>
          ) : null}
        </Field>

        <div className={isRealestate ? "" : "hidden"}>
          <p className="mb-2 text-xs font-medium text-slate-400">
            טיפוסי דירות ומלאי התחלתי (תוכניות דירה מעלים אחרי ההקמה)
          </p>
          <div className="flex flex-col gap-2">
            {units.map((u, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_110px_80px_32px] items-center gap-2">
                <Input placeholder='שם: "דירת גן 4 חד׳"' value={u.name} onChange={(e) => setUnit(i, { name: e.target.value })} />
                <Input placeholder="חדרים" type="number" step="0.5" value={u.rooms} onChange={(e) => setUnit(i, { rooms: e.target.value })} />
                <Input placeholder="מחיר ₪" type="number" value={u.price} onChange={(e) => setUnit(i, { price: e.target.value })} />
                <Input placeholder="כמות" type="number" value={u.totalUnits} onChange={(e) => setUnit(i, { totalUnits: e.target.value })} />
                <button
                  type="button"
                  onClick={() => setUnits(units.filter((_, idx) => idx !== i))}
                  className="rounded p-1.5 text-slate-600 hover:text-red-600"
                  title="הסרה"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setUnits([...units, { name: "", rooms: "", price: "", totalUnits: "" }])}
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            טיפוס נוסף
          </Button>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "מקים…" : "הקמת הפרויקט"}</Button>
        </div>
      </form>
    </Modal>
  );
}
