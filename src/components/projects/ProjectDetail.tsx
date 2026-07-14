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
  unitType: { name: string } | null;
}

interface ProjectFull {
  id: string;
  name: string;
  description: string | null;
  status: string;
  clientId: string;
  unitTypes: Unit[];
  contracts: ContractRow[];
  purchaseRequests: RequestRow[];
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
}: {
  projectId: string;
  clientId: string;
}) {
  const [project, setProject] = useState<ProjectFull | null>(null);
  const [events, setEvents] = useState<InvEvent[]>([]);
  const [error, setError] = useState("");
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [addUnit, setAddUnit] = useState(false);
  const [uploadPlanFor, setUploadPlanFor] = useState<Unit | null>(null);
  const [addContract, setAddContract] = useState(false);

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
      {/* Inventory board */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100">מלאי דירות</h3>
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
              <div key={u.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-slate-100">{u.name}</p>
                    <p className="text-xs text-slate-500">
                      {u.rooms ? `${u.rooms} חד׳ · ` : ""}
                      {u._count.leads} לידים משויכים
                    </p>
                  </div>
                  <button
                    onClick={() => setEditUnit(u)}
                    className="rounded p-1.5 text-slate-500 hover:text-cyan-300"
                    title="עריכה"
                  >
                    <Icon name="edit" className="h-4 w-4" />
                  </button>
                </div>

                <p className="mt-2 text-lg font-bold text-amber-300">{formatCurrency(u.price)}</p>
                {u.priceChanges.length > 0 ? (
                  <p className="text-[10px] text-slate-600">
                    עודכן {formatDate(u.priceChanges[0].createdAt)} (היה {formatCurrency(u.priceChanges[0].oldPrice)})
                  </p>
                ) : null}

                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className={available === 0 ? "font-bold text-red-400" : "text-emerald-300"}>
                      {available === 0 ? "אזל המלאי" : `${available} זמינות`}
                    </span>
                    <span className="text-slate-500">{u.soldUnits}/{u.totalUnits} נמכרו</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
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
                      className="inline-flex items-center gap-1 text-slate-500 hover:text-cyan-300"
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

      {/* Contracts */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100">חוזים</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {project.contracts.length} חוזים · ערך כולל:{" "}
              <span className="font-bold text-amber-300">{formatCurrency(totalValue)}</span>
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
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 px-3 py-2">
                <Icon name="doc" className="h-4 w-4 text-amber-300" />
                <span className="text-sm text-slate-200">
                  {c.lead ? `${c.lead.fullName ?? ""} (ליד #${c.lead.number})` : "ללא ליד"}
                </span>
                {c.unitType ? <Chip color="#22d3ee">{c.unitType.name}</Chip> : null}
                <span className="font-bold text-amber-300">{formatCurrency(c.value)}</span>
                <span className="text-xs text-slate-500">
                  {c.signedAt ? `נחתם ${formatDate(c.signedAt)}` : "טרם נחתם"}
                </span>
                <div className="mr-auto">
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
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Purchase requests */}
      <Card>
        <h3 className="mb-3 text-base font-bold text-slate-100">בקשות רכישה</h3>
        {project.purchaseRequests.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-600">
            אין בקשות רכישה. נפתחות מכרטיס ליד או מעמוד &quot;בקשות רכישה&quot;.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {project.purchaseRequests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 px-3 py-2">
                <span className="text-sm text-slate-200">
                  {r.lead ? `${r.lead.fullName ?? ""} (#${r.lead.number})` : "—"}
                </span>
                {r.unitType ? <Chip color="#22d3ee">{r.unitType.name}</Chip> : null}
                {r.amount ? <span className="text-xs text-amber-300">{formatCurrency(r.amount)}</span> : null}
                <Chip color={REQ_STATUS[r.status]?.color ?? "#64748b"}>
                  {REQ_STATUS[r.status]?.label ?? r.status}
                </Chip>
                <span className="mr-auto text-[11px] text-slate-600">{formatDate(r.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Inventory audit trail */}
      <Card>
        <h3 className="mb-3 text-base font-bold text-slate-100">יומן מלאי</h3>
        {events.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-600">אין תנועות מלאי עדיין.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center gap-2 text-xs">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full font-bold ${
                    ev.delta < 0
                      ? "bg-red-500/15 text-red-400"
                      : ev.delta > 0
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-slate-700/40 text-slate-400"
                  }`}
                >
                  {ev.delta < 0 ? "−" : ev.delta > 0 ? "+" : "!"}
                </span>
                <span className="text-slate-300">{ev.unitType.name}</span>
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
    </div>
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
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="מחיר (₪)" hint="שינוי נשמר בהיסטוריית מחירים">
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="מלאי כולל">
            <Input type="number" value={totalUnits} onChange={(e) => setTotalUnits(e.target.value)} />
          </Field>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
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
          <div className="text-xs text-slate-500">
            <p className="mb-1 font-medium text-slate-400">היסטוריית מחירים:</p>
            {unit.priceChanges.map((pc) => (
              <p key={pc.id}>
                {formatDate(pc.createdAt)}: {formatCurrency(pc.oldPrice)} ← {formatCurrency(pc.newPrice)}
              </p>
            ))}
          </div>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>סגירה</Button>
          <Button disabled={busy} onClick={() => save()}>
            {busy ? "שומר…" : "שמירה"}
          </Button>
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
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
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
  onClose,
  onSaved,
}: {
  clientId: string;
  project: ProjectFull;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    unitTypeId: "",
    value: "",
    signedAt: new Date().toISOString().slice(0, 10),
    notes: "",
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
          unitTypeId: form.unitTypeId || null,
          value: Number(form.value) || 0,
          signedAt: form.signedAt || null,
          documentId,
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
    <>
      <Modal title="חוזה חדש" onClose={onClose}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
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

          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-3">
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
