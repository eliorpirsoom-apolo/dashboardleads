"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/fetcher";
import { Button, Card } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";
import { ClientFormModal } from "@/components/clients/ClientsGrid";
import { UploadModal } from "@/components/documents/DocumentsView";

export default function ClientEditCard({
  client,
}: {
  client: {
    id: string;
    name: string;
    type: string;
    company: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    color: string | null;
    notes: string | null;
    active: boolean;
    autoAssignLeads: boolean;
    logoKey: string | null;
    birthday?: string | null;
  };
}) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [showLogoUpload, setShowLogoUpload] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState("");

  async function deleteClient() {
    setDeleting(true);
    setDelError("");
    try {
      await api(`/api/clients/${client.id}`, { method: "DELETE", json: { confirmName: confirmText.trim() } });
      router.push("/admin/clients");
    } catch (e: any) {
      setDelError(e.message);
      setDeleting(false);
    }
  }

  async function toggleAutoAssign() {
    await api(`/api/clients/${client.id}`, {
      method: "PATCH",
      json: { autoAssignLeads: !client.autoAssignLeads },
    });
    router.refresh();
  }

  async function toggleActive() {
    const msg = client.active
      ? "להשבית את הלקוח? המשתמשים שלו לא יוכלו להתחבר."
      : "להפעיל את הלקוח מחדש?";
    if (!confirm(msg)) return;
    await api(`/api/clients/${client.id}`, {
      method: "PATCH",
      json: { active: !client.active },
    });
    router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {client.logoKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/files/${client.logoKey}`}
              alt="לוגו"
              className="h-12 w-12 rounded-xl border border-slate-300 bg-white/5 object-contain p-1"
            />
          ) : null}
          <div>
            <h3 className="text-base font-bold text-slate-800">פרטי הלקוח</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {client.company ?? client.name}
              {client.contactEmail ? ` · ${client.contactEmail}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowLogoUpload(true)}>
            <Icon name="upload" className="h-4 w-4" />
            {client.logoKey ? "החלפת לוגו" : "העלאת לוגו חברה"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)}>
            <Icon name="edit" className="h-4 w-4" />
            עריכת פרטים
          </Button>
          <Button
            variant={client.active ? "danger" : "primary"}
            size="sm"
            onClick={toggleActive}
          >
            {client.active ? "השבתת לקוח" : "הפעלת לקוח"}
          </Button>
        </div>
      </div>

      {showLogoUpload ? (
        <UploadModal
          clientId={client.id}
          defaultCategory="logo"
          onClose={() => setShowLogoUpload(false)}
          onUploaded={async (docId) => {
            await api(`/api/clients/${client.id}`, {
              method: "PATCH",
              json: { logoKey: docId },
            });
            setShowLogoUpload(false);
            router.refresh();
          }}
        />
      ) : null}

      {/* Round-robin auto-assignment toggle */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-slate-700">שיוך לידים אוטומטי לסוכנים</p>
          <p className="text-[11px] text-slate-500">
            ליד חדש מהקליטה משויך אוטומטית בסבב לסוכן המכירות עם הכי מעט לידים פעילים.
          </p>
        </div>
        <button
          onClick={toggleAutoAssign}
          className={`relative h-6 w-11 rounded-full transition ${client.autoAssignLeads ? "bg-cyan-500" : "bg-slate-700"}`}
          title={client.autoAssignLeads ? "כיבוי" : "הפעלה"}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${client.autoAssignLeads ? "right-0.5" : "right-[22px]"}`}
          />
        </button>
      </div>

      {/* אזור מסוכן — מחיקה לצמיתות */}
      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-red-700">מחיקת לקוח לצמיתות</p>
            <p className="text-[11px] text-red-600">
              מוחק את הלקוח וכל המידע המקושר (לידים, משימות, סטודיו, מסמכים, חשבוניות) — בלתי הפיך. לרוב עדיף ״השבתת לקוח״.
            </p>
          </div>
          <button
            onClick={() => { setConfirmText(""); setDelError(""); setShowDelete(true); }}
            className="rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
          >
            מחיקה לצמיתות
          </button>
        </div>
      </div>

      {showEdit ? (
        <ClientFormModal
          existing={client}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            router.refresh();
          }}
        />
      ) : null}

      {showDelete ? (
        <Modal title="מחיקת לקוח לצמיתות" onClose={() => setShowDelete(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-700">
              פעולה זו תמחק את הלקוח <b>{client.name}</b> ואת <b>כל</b> המידע המקושר אליו — לידים, משימות, עבודות סטודיו, מסמכים, חשבוניות ומשתמשי הלקוח.{" "}
              <b className="text-red-600">אין אפשרות לשחזר.</b>
            </p>
            <p className="text-xs text-slate-500">לרוב עדיף ״השבתת לקוח״ שמשאירה את כל המידע. המשך רק אם אתה בטוח לחלוטין.</p>
            {delError ? <p className="text-sm text-red-600">{delError}</p> : null}
            <label className="text-xs text-slate-600">
              לאישור, הקלד/י את שם הלקוח במדויק: <b dir="ltr">{client.name}</b>
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              placeholder={client.name}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-red-500 focus:outline-none"
            />
            <div className="mt-1 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowDelete(false)}>ביטול</Button>
              <button
                disabled={deleting || confirmText.trim() !== client.name.trim()}
                onClick={deleteClient}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleting ? "מוחק…" : "מחק לצמיתות"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}
