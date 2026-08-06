"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { Button, Card, Chip, Field, Input, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";
import { UploadModal } from "@/components/documents/DocumentsView";

interface Unit {
  id: string;
  name: string;
  rooms: number | null;
  price: number;
  totalUnits: number;
  soldUnits: number;
  priceChanges: { id: string; oldPrice: number; newPrice: number; createdAt: string }[];
  documents: { id: string; fileName: string }[];
  _count: { leads: number };
}

interface ContractRow {
  id: string;
  value: number;
  signedAt: string | null;
  notes: string | null;
  lead: { id: string; fullName: string | null; number: number } | null;
  unitType: { name: string } | null;
  document: { id: string; fileName: string } | null;
}

interface RequestRow {
  id: string;
  status: string;
  amount: number | null;
  notes: string | null;
  createdAt: string;
  lead: { id: string; fullName: string | null; number: number; phone: string | null } | null;
  unitType: { id: string; name: string } | null;
}

interface ProjectFull {
  id: string;
  name: string;
  description: string | null;
  status: string;
  clientId: string;
  logoKey: string | null;
  unitTypes: Unit[];
  contracts: ContractRow[];
  purchaseRequests: RequestRow[];
  assignments: {
    id: string;
    userId: string;
    isPrimary: boolean;
    user: { id: string; name: string; email: string; active: boolean };
  }[];
}

interface InvEvent {
  id: string;
  delta: number;
  reason: string;
  note: string | null;
  actorName: string | null;
  createdAt: string;
  unitType: { name: string };
  lead: { fullName: string | null; number: number } | null;
}

const REQ_STATUS: Record<string, { label: string; color: string }> = {
  new: { label: "חדשה", color: "#38bdf8" },
  approved: { label: "אושרה", color: "#34d399" },
  rejected: { label: "נדחתה", color: "#f87171" },
  converted: { label: "הפכה לחוזה", color: "#fbbf24" },
};

export default function ProjectDetail({
  projectId,
  clientId,
  isRealestate = true,
}: {
  projectId: string;
  clientId: string;
  isRealestate?: boolean; // false → כללי: בלי מלאי, חוזים ובקשות רכישה
}) {
  const [project, setProject] = useState<ProjectFull | null>(null);
  const [events, setEvents] = useState<InvEvent[]>([]);
  const [error, setError] = useState("");
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [addUnit, setAddUnit] = useState(false);
  const [uploadPlanFor, setUploadPlanFor] = useState<Unit | null>(null);
  const [addContract, setAddContract] = useState(false);
  const [editContract, setEditContract] = useState<ContractRow | null>(null);
  const [convertRequest, setConvertRequest] = useState<RequestRow | null>(null);
  const [showEditProject, setShowEditProject] = useState(false);
  const [showLogoUpload, setShowLogoUpload] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ project: ProjectFull; inventoryEvents: InvEvent[] }>(
        `/api/projects/${projectId}`
      );
      setProject(d.project);
      setEvents(d.inventoryEvents);
    } catch (e: any) {
      setError(e.message);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!project) {
    return <p className="p-8 text-center text-sm text-slate-500">{error || "טוען…"}</p>;
  }

  const totalValue = project.contracts.reduce((s, c) => s + c.value, 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Project header actions */}
      <div className="flex flex-wrap items-center gap-3">
        {project.logoKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/files/${project.logoKey}`}
            alt=""
            className="h-12 w-12 rounded-xl border border-slate-300 bg-white/5 object-contain p-1"
          />
        ) : null}
        {project.status !== "active" ? (
          <Chip color="#94a3b8">{project.status === "done" ? "פרויקט הסתיים" : "בארכיון"}</Chip>
        ) : null}
        <div className="mr-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowLogoUpload(true)}>
            <Icon name="upload" className="h-3.5 w-3.5" />
            {project.logoKey ? "החלפת לוגו פרויקט" : "לוגו פרויקט"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowEditProject(true)}>
            <Icon name="edit" className="h-3.5 w-3.5" />
            עריכת פרויקט
          </Button>
        </div>
      </div>

      {/* Sales agents — לכל פרויקט המשתמש והלידים שלו */}
      <AgentsCard project={project} clientId={clientId} onChanged={load} />

      {/* רשימת חומרים מהלקוח ("מכולת") */}
      <MaterialsCard projectId={projectId} />

      {isRealestate ? (
      <>
      {/* Inventory board */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">מלאי דירות</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              המלאי מתעדכן אוטומטית כשליד עובר לסטטוס &quot;עסקה&quot; — וחוזר כשמבטלים.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setAddUnit(true)}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            טיפוס חדש
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {project.unitTypes.map((u) => {
            const available = u.totalUnits - u.soldUnits;
            const pct = u.totalUnits > 0 ? (u.soldUnits / u.totalUnits) * 100 : 0;
            return (
              <div key={u.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-slate-800">{u.name}</p>
                    <p className="text-xs text-slate-500">
                      {u.rooms ? `${u.rooms} חד׳ · ` : ""}
                      {u._count.leads} לידים משויכים
                    </p>
                  </div>
                  <button
                    onClick={() => setEditUnit(u)}
                    className="rounded p-1.5 text-slate-500 hover:text-cyan-700"
                    title="עריכה"
                  >
                    <Icon name="edit" className="h-4 w-4" />
                  </button>
                </div>

                <p className="mt-2 text-lg font-bold text-amber-700">{formatCurrency(u.price)}</p>
                {u.priceChanges.length > 0 ? (
                  <p className="text-[10px] text-slate-600">
                    עודכן {formatDate(u.priceChanges[0].createdAt)} (היה {formatCurrency(u.priceChanges[0].oldPrice)})
                  </p>
                ) : null}

                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className={available === 0 ? "font-bold text-red-600" : "text-emerald-700"}>
                      {available === 0 ? "אזל המלאי" : `${available} זמינות`}
                    </span>
                    <span className="text-slate-500">{u.soldUnits}/{u.totalUnits} נמכרו</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${available === 0 ? "bg-red-500/70" : "bg-gradient-to-l from-emerald-400 to-cyan-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs">
                  {u.documents.length > 0 ? (
                    <a
                      href={`/api/files/${u.documents[0].id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-cyan-400 hover:underline"
                    >
                      <Icon name="doc" className="h-3.5 w-3.5" />
                      תוכנית דירה
                    </a>
                  ) : (
                    <button
                      onClick={() => setUploadPlanFor(u)}
                      className="inline-flex items-center gap-1 text-slate-500 hover:text-cyan-700"
                    >
                      <Icon name="upload" className="h-3.5 w-3.5" />
                      העלאת תוכנית דירה
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Purchase requests */}
      <Card>
        <h3 className="mb-3 text-base font-bold text-slate-800">בקשות רכישה</h3>
        {project.purchaseRequests.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-600">
            אין בקשות רכישה. נפתחות מכרטיס ליד או מעמוד &quot;בקשות רכישה&quot;.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {project.purchaseRequests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-700">
                  {r.lead ? `${r.lead.fullName ?? ""} (#${r.lead.number})` : "—"}
                </span>
                {r.unitType ? <Chip color="#22d3ee">{r.unitType.name}</Chip> : null}
                {r.amount ? <span className="text-xs text-amber-700">{formatCurrency(r.amount)}</span> : null}
                <Chip color={REQ_STATUS[r.status]?.color ?? "#64748b"}>
                  {REQ_STATUS[r.status]?.label ?? r.status}
                </Chip>
                <span className="mr-auto text-[11px] text-slate-600">{formatDate(r.createdAt)}</span>
                {r.status === "approved" ? (
                  <Button size="sm" variant="ghost" onClick={() => setConvertRequest(r)}>
                    <Icon name="doc" className="h-3.5 w-3.5" />
                    המר לחוזה
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Contracts */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">חוזים</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {project.contracts.length} חוזים · ערך כולל:{" "}
              <span className="font-bold text-amber-700">{formatCurrency(totalValue)}</span>
            </p>
          </div>
          <Button size="sm" onClick={() => setAddContract(true)}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            חוזה חדש
          </Button>
        </div>
        {project.contracts.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-600">אין חוזים עדיין.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {project.contracts.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                <Icon name="doc" className="h-4 w-4 text-amber-700" />
                <span className="text-sm text-slate-700">
                  {c.lead ? `${c.lead.fullName ?? ""} (ליד #${c.lead.number})` : "ללא ליד"}
                </span>
                {c.unitType ? <Chip color="#22d3ee">{c.unitType.name}</Chip> : null}
                <span className="font-bold text-amber-700">{formatCurrency(c.value)}</span>
                <span className="text-xs text-slate-500">
                  {c.signedAt ? `נחתם ${formatDate(c.signedAt)}` : "טרם נחתם"}
                </span>
                <div className="mr-auto flex items-center gap-1">
                  {c.document ? (
                    <a
                      href={`/api/files/${c.document.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline"
                    >
                      <Icon name="download" className="h-3.5 w-3.5" />
                      PDF חתום
                    </a>
                  ) : (
                    <span className="text-xs text-slate-600">אין קובץ</span>
                  )}
                  <button
                    onClick={() => setEditContract(c)}
                    className="rounded p-1.5 text-slate-500 hover:text-cyan-700"
                    title="עריכת חוזה"
                  >
                    <Icon name="edit" className="h-4 w-4" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("למחוק את החוזה? (הקובץ נשאר במסמכים)")) return;
                      try {
                        await api(`/api/contracts/${c.id}`, { method: "DELETE" });
                        load();
                      } catch (e: any) {
                        alert(e.message);
                      }
                    }}
                    className="rounded p-1.5 text-slate-500 hover:text-red-600"
                    title="מחיקת חוזה"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Inventory audit trail */}
      <Card>
        <h3 className="mb-3 text-base font-bold text-slate-800">יומן מלאי</h3>
        {events.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-600">אין תנועות מלאי עדיין.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center gap-2 text-xs">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full font-bold ${
                    ev.delta < 0
                      ? "bg-red-500/15 text-red-600"
                      : ev.delta > 0
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-slate-700/40 text-slate-400"
                  }`}
                >
                  {ev.delta < 0 ? "−" : ev.delta > 0 ? "+" : "!"}
                </span>
                <span className="text-slate-600">{ev.unitType.name}</span>
                <span className="text-slate-500">
                  {ev.reason === "sold" ? "נמכרה" : ev.reason === "reverted" ? "חזרה למלאי" : "עדכון ידני"}
                  {ev.lead ? ` · ליד #${ev.lead.number} ${ev.lead.fullName ?? ""}` : ""}
                  {ev.note ? ` · ${ev.note}` : ""}
                  {ev.actorName ? ` · ${ev.actorName}` : ""}
                </span>
                <span className="mr-auto text-slate-600">{formatDateTime(ev.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      </>
      ) : null}

      {/* Modals */}
      {editUnit ? (
        <UnitEditModal
          unit={editUnit}
          onClose={() => setEditUnit(null)}
          onSaved={() => {
            setEditUnit(null);
            load();
          }}
        />
      ) : null}

      {addUnit ? (
        <AddUnitModal
          projectId={project.id}
          onClose={() => setAddUnit(false)}
          onSaved={() => {
            setAddUnit(false);
            load();
          }}
        />
      ) : null}

      {uploadPlanFor ? (
        <UploadModal
          clientId={clientId}
          defaultCategory="floor_plan"
          projectId={project.id}
          unitTypeId={uploadPlanFor.id}
          onClose={() => setUploadPlanFor(null)}
          onUploaded={() => {
            setUploadPlanFor(null);
            load();
          }}
        />
      ) : null}

      {addContract ? (
        <AddContractModal
          clientId={clientId}
          project={project}
          onClose={() => setAddContract(false)}
          onSaved={() => {
            setAddContract(false);
            load();
          }}
        />
      ) : null}

      {convertRequest ? (
        <AddContractModal
          clientId={clientId}
          project={project}
          fromRequest={convertRequest}
          onClose={() => setConvertRequest(null)}
          onSaved={() => {
            setConvertRequest(null);
            load();
          }}
        />
      ) : null}

      {editContract ? (
        <EditContractModal
          contract={editContract}
          onClose={() => setEditContract(null)}
          onSaved={() => {
            setEditContract(null);
            load();
          }}
        />
      ) : null}

      {showEditProject ? (
        <EditProjectModal
          project={project}
          onClose={() => setShowEditProject(false)}
          onSaved={() => {
            setShowEditProject(false);
            load();
          }}
        />
      ) : null}

      {showLogoUpload ? (
        <UploadModal
          clientId={clientId}
          defaultCategory="logo"
          projectId={project.id}
          onClose={() => setShowLogoUpload(false)}
          onUploaded={async (docId) => {
            await api(`/api/projects/${project.id}`, {
              method: "PATCH",
              json: { logoKey: docId },
            });
            setShowLogoUpload(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

// עריכת פרטי פרויקט + סטטוס (פעיל / הסתיים / ארכיון).
function EditProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectFull;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: project.name,
    description: project.description ?? "",
    status: project.status,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/projects/${project.id}`, {
        method: "PATCH",
        json: {
          name: form.name,
          description: form.description || null,
          status: form.status,
        },
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="עריכת פרויקט" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Field label="שם הפרויקט">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="תיאור">
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="סטטוס פרויקט">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">פעיל</option>
            <option value="done">הסתיים</option>
            <option value="archived">ארכיון</option>
          </Select>
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "שומר…" : "שמירה"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// עריכת חוזה קיים (ערך, תאריך, הערות).
function EditContractModal({
  contract,
  onClose,
  onSaved,
}: {
  contract: ContractRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    value: String(contract.value),
    signedAt: contract.signedAt ? contract.signedAt.slice(0, 10) : "",
    notes: contract.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/contracts/${contract.id}`, {
        method: "PATCH",
        json: {
          value: Number(form.value) || 0,
          signedAt: form.signedAt || null,
          notes: form.notes || null,
        },
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="עריכת חוזה" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="ערך החוזה (₪)">
            <Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
          </Field>
          <Field label="תאריך חתימה">
            <Input type="date" value={form.signedAt} onChange={(e) => setForm({ ...form, signedAt: e.target.value })} />
          </Field>
        </div>
        <Field label="הערות">
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "שומר…" : "שמירה"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function UnitEditModal({
  unit,
  onClose,
  onSaved,
}: {
  unit: Unit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [price, setPrice] = useState(String(unit.price));
  const [totalUnits, setTotalUnits] = useState(String(unit.totalUnits));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(extra?: Record<string, any>) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/units/${unit.id}`, {
        method: "PATCH",
        json: {
          price: Number(price),
          totalUnits: Number(totalUnits),
          ...extra,
        },
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`עריכה — ${unit.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="מחיר (₪)" hint="שינוי נשמר בהיסטוריית מחירים">
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="מלאי כולל">
            <Input type="number" value={totalUnits} onChange={(e) => setTotalUnits(e.target.value)} />
          </Field>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs text-slate-400">
            תיקון מלאי ידני (נמכרו: {unit.soldUnits} / {unit.totalUnits})
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || unit.soldUnits >= unit.totalUnits}
              onClick={() => save({ manualAdjust: -1 })}
            >
              −1 סימון כנמכרה
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || unit.soldUnits <= 0}
              onClick={() => save({ manualAdjust: 1 })}
            >
              +1 החזרה למלאי
            </Button>
          </div>
        </div>

        {unit.priceChanges.length > 0 ? (
          <div className="thin-scroll max-h-32 overflow-y-auto text-xs text-slate-500">
            <p className="mb-1 font-medium text-slate-400">היסטוריית מחירים מלאה:</p>
            {unit.priceChanges.map((pc) => (
              <p key={pc.id}>
                {formatDate(pc.createdAt)}: {formatCurrency(pc.oldPrice)} ← {formatCurrency(pc.newPrice)}
              </p>
            ))}
          </div>
        ) : null}

        <div className="mt-1 flex justify-between gap-2">
          <Button
            variant="danger"
            size="sm"
            disabled={busy || unit._count.leads > 0}
            title={unit._count.leads > 0 ? `${unit._count.leads} לידים מקושרים — אי אפשר למחוק` : undefined}
            onClick={async () => {
              if (!confirm(`למחוק את הטיפוס "${unit.name}"?`)) return;
              try {
                setBusy(true);
                await api(`/api/units/${unit.id}`, { method: "DELETE" });
                onSaved();
              } catch (e: any) {
                setError(e.message);
                setBusy(false);
              }
            }}
          >
            מחיקת טיפוס
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>סגירה</Button>
            <Button disabled={busy} onClick={() => save()}>
              {busy ? "שומר…" : "שמירה"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AddUnitModal({
  projectId,
  onClose,
  onSaved,
}: {
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ name: "", rooms: "", price: "", totalUnits: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/projects/${projectId}/units`, {
        method: "POST",
        json: {
          name: form.name,
          rooms: form.rooms ? Number(form.rooms) : null,
          price: Number(form.price) || 0,
          totalUnits: Number(form.totalUnits) || 0,
        },
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="טיפוס דירה חדש" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Field label="שם הטיפוס">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder='"דירת גן 4 חד׳"' required />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="חדרים">
            <Input type="number" step="0.5" value={form.rooms} onChange={(e) => setForm({ ...form, rooms: e.target.value })} />
          </Field>
          <Field label="מחיר (₪)">
            <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </Field>
          <Field label="כמות במלאי">
            <Input type="number" value={form.totalUnits} onChange={(e) => setForm({ ...form, totalUnits: e.target.value })} />
          </Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "מוסיף…" : "הוספה"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function AddContractModal({
  clientId,
  project,
  fromRequest,
  onClose,
  onSaved,
}: {
  clientId: string;
  project: ProjectFull;
  fromRequest?: RequestRow; // המרת בקשת רכישה מאושרת לחוזה
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    unitTypeId: fromRequest?.unitType?.id ?? "",
    value: fromRequest?.amount ? String(fromRequest.amount) : "",
    signedAt: new Date().toISOString().slice(0, 10),
    notes: fromRequest ? `נוצר מבקשת רכישה` : "",
  });
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/contracts", {
        method: "POST",
        json: {
          clientId,
          projectId: project.id,
          leadId: fromRequest?.lead?.id ?? null,
          unitTypeId: form.unitTypeId || null,
          value: Number(form.value) || 0,
          signedAt: form.signedAt || null,
          documentId,
          notes: form.notes || null,
        },
      });
      // בקשה שהומרה מסומנת אוטומטית "הפכה לחוזה".
      if (fromRequest) {
        await api(`/api/purchase-requests/${fromRequest.id}`, {
          method: "PATCH",
          json: { status: "converted" },
        });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal title="חוזה חדש" onClose={onClose}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="טיפוס דירה">
              <Select value={form.unitTypeId} onChange={(e) => setForm({ ...form, unitTypeId: e.target.value })}>
                <option value="">—</option>
                {project.unitTypes.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="ערך החוזה (₪)">
              <Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
            </Field>
          </div>
          <Field label="תאריך חתימה">
            <Input type="date" value={form.signedAt} onChange={(e) => setForm({ ...form, signedAt: e.target.value })} />
          </Field>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-xs text-slate-400">
              {documentId ? "✓ PDF חתום צורף" : "PDF חתום (אופציונלי)"}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowUpload(true)}>
              <Icon name="upload" className="h-3.5 w-3.5" />
              {documentId ? "החלפה" : "העלאה"}
            </Button>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
            <Button type="submit" disabled={busy}>{busy ? "שומר…" : "שמירת חוזה"}</Button>
          </div>
        </form>
      </Modal>

      {showUpload ? (
        <UploadModal
          clientId={clientId}
          defaultCategory="contract"
          projectId={project.id}
          onClose={() => setShowUpload(false)}
          onUploaded={(docId) => {
            setDocumentId(docId);
            setShowUpload(false);
          }}
        />
      ) : null}
    </>
  );
}

// --- Sales agents of the project -------------------------------------------
// שיוך אנשי מכירות: הראשי (★) מקבל את הלידים הנכנסים ממקורות הפרויקט,
// וסוכן משויך רואה במערכת רק את הפרויקטים שלו.

function AgentsCard({
  project,
  clientId,
  onChanged,
}: {
  project: ProjectFull;
  clientId: string;
  onChanged: () => void;
}) {
  const [agents, setAgents] = useState<{ id: string; name: string; isAgent: boolean }[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // טופס "משווק חדש" — יצירה ושיוך לפרויקט בפעולה אחת.
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    api<{ users: { id: string; name: string; isAgent: boolean }[] }>(
      `/api/client-users?clientId=${clientId}`
    )
      // כל משתמשי הלקוח — גם הבעלים יכול להיות איש המכירות של פרויקט
      // (סוכן מצומצם לפרויקטים שלו; בעלים ממשיך לראות הכול).
      .then((d) => setAgents(d.users))
      .catch(() => setAgents([]));
  }, [clientId]);

  const assignedIds = new Set(project.assignments.map((a) => a.userId));
  const options = agents.filter((a) => !assignedIds.has(a.id));

  async function add(isPrimary: boolean) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/projects/${project.id}/agents`, {
        method: "POST",
        json: { userId: selected, isPrimary },
      });
      setSelected("");
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // יצירת משווק חדש + שיוך לפרויקט (הראשי — אם הוא הראשון).
  async function createAndAssign(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/projects/${project.id}/agents`, {
        method: "POST",
        json: {
          create: {
            name: newName,
            email: newEmail,
            whatsappPhone: newWhatsapp || null,
            password: newPassword || undefined,
          },
          isPrimary: project.assignments.length === 0,
        },
      });
      setShowNew(false);
      setNewName("");
      setNewEmail("");
      setNewWhatsapp("");
      setNewPassword("");
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setPrimary(userId: string) {
    try {
      await api(`/api/projects/${project.id}/agents`, {
        method: "POST",
        json: { userId, isPrimary: true },
      });
      onChanged();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(userId: string) {
    try {
      await api(`/api/projects/${project.id}/agents?userId=${userId}`, { method: "DELETE" });
      onChanged();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <Card>
      <div className="mb-3">
        <h3 className="text-base font-bold text-slate-800">משווקי הפרויקט</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          הראשי (★) מקבל אוטומטית את הלידים הנכנסים ממקורות הפרויקט. משווק משויך רואה רק את
          הפרויקטים שלו.
        </p>
      </div>

      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

      {project.assignments.length === 0 ? (
        <p className="py-3 text-center text-xs text-slate-600">
          אין משווקים משויכים — לידים ממקורות הפרויקט ייכנסו ללא מטפל.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {project.assignments.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2"
            >
              <Icon name="users" className="h-4 w-4 text-cyan-700" />
              <span className="text-sm font-medium text-slate-700">{a.user.name}</span>
              <span className="text-xs text-slate-500">{a.user.email}</span>
              {a.isPrimary ? (
                <Chip color="#22d3ee">★ ראשי</Chip>
              ) : (
                <button
                  onClick={() => setPrimary(a.userId)}
                  className="text-xs text-slate-500 hover:text-cyan-700"
                >
                  קבע כראשי
                </button>
              )}
              {!a.user.active ? <Chip color="#f87171">לא פעיל</Chip> : null}
              <button
                onClick={() => remove(a.userId)}
                className="mr-auto rounded p-1.5 text-slate-500 hover:text-red-600"
                title="הסרת שיוך"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-56">
          <option value="">בחירת משווק…</option>
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Button size="sm" disabled={!selected || busy} onClick={() => add(project.assignments.length === 0)}>
          <Icon name="plus" className="h-3.5 w-3.5" />
          שיוך לפרויקט
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowNew((s) => !s)}>
          <Icon name="users" className="h-3.5 w-3.5" />
          משווק חדש
        </Button>
      </div>

      {showNew ? (
        <form onSubmit={createAndAssign} className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-bold text-slate-700">משווק חדש — ייפתח וישויך לפרויקט</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="שם מלא">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </Field>
            <Field label="אימייל">
              <Input dir="ltr" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
            </Field>
            <Field label="וואטסאפ להתראות לידים 📲" hint="כל ליד חדש בפרויקט יישלח לוואטסאפ הזה">
              <Input dir="ltr" value={newWhatsapp} onChange={(e) => setNewWhatsapp(e.target.value)} placeholder="0501234567" />
            </Field>
            <Field label="סיסמה" hint="ריק = כניסה עם Google בלבד">
              <Input dir="ltr" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowNew(false)}>ביטול</Button>
            <Button type="submit" size="sm" disabled={busy || !newName.trim() || !newEmail.trim()}>
              {busy ? "שומר…" : "שמירה"}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}

// רשימת החומרים מהלקוח ("מכולת") — שליחה, תזכורות, וסימון קבלה.
interface Material {
  id: string;
  label: string;
  received: boolean;
}
function MaterialsCard({ projectId }: { projectId: string }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [requestedAt, setRequestedAt] = useState<string | null>(null);
  const [received, setReceived] = useState(false);
  const [remindersSent, setRemindersSent] = useState(0);
  const [templates, setTemplates] = useState<{ id: string; name: string; items: string[] }[]>([]);
  const [tpl, setTpl] = useState("");
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await api<{
      materials: Material[];
      requestedAt: string | null;
      received: boolean;
      remindersSent: number;
    }>(`/api/projects/${projectId}/materials`);
    setMaterials(d.materials);
    setRequestedAt(d.requestedAt);
    setReceived(d.received);
    setRemindersSent(d.remindersSent);
  }, [projectId]);

  useEffect(() => {
    load();
    api<{ templates: { id: string; name: string; items: string[] }[] }>("/api/material-templates")
      .then((d) => setTemplates(d.templates))
      .catch(() => {});
  }, [load]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/materials`, { method: "POST", json: body });
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const doneCount = materials.filter((m) => m.received).length;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-800">📦 חומרים מהלקוח</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {requestedAt
              ? `נשלחה בקשה · ${remindersSent} תזכורות`
              : "טרם נשלחה בקשה"}
            {materials.length ? ` · ${doneCount}/${materials.length} התקבלו` : ""}
          </p>
        </div>
        {materials.length > 0 ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => act({ action: "toggleReceived", received: !received })}
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                received ? "bg-emerald-500/15 text-emerald-700" : "bg-slate-100 text-slate-400"
              }`}
            >
              {received ? "✓ חומרים התקבלו" : "סמן: חומרים התקבלו"}
            </button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ action: "send" })}>
              <Icon name="megaphone" className="h-3.5 w-3.5" />
              {requestedAt ? "שלח תזכורת" : "שלח בקשה"}
            </Button>
          </div>
        ) : null}
      </div>

      {materials.length === 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="החלת רשימת חומרים">
            <Select value={tpl} onChange={(e) => setTpl(e.target.value)} className="!w-52">
              <option value="">— בחרו תבנית —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.items.length})
                </option>
              ))}
            </Select>
          </Field>
          <Button
            size="sm"
            disabled={!tpl || busy}
            onClick={async () => {
              await act({ action: "applyTemplate", templateId: tpl });
              await act({ action: "send" });
            }}
          >
            החל ושלח ללקוח
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {materials.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <button
                  onClick={() => act({ action: "toggleItem", itemId: m.id, received: !m.received })}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                    m.received
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-700"
                      : "border-slate-600 text-transparent"
                  }`}
                >
                  ✓
                </button>
                <span className={`flex-1 text-sm ${m.received ? "text-slate-500 line-through" : "text-slate-700"}`}>
                  {m.label}
                </span>
                <button
                  onClick={() =>
                    fetch(`/api/projects/${projectId}/materials?itemId=${m.id}`, { method: "DELETE" }).then(load)
                  }
                  className="rounded p-1 text-slate-600 hover:text-red-600"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newItem.trim()) {
                  e.preventDefault();
                  act({ action: "addItem", label: newItem.trim() });
                  setNewItem("");
                }
              }}
              placeholder="+ פריט חומרים"
              className="!w-52 !py-1 text-xs"
            />
          </div>
        </>
      )}
    </Card>
  );
}
