"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/fetcher";
import { Button, Card } from "@/components/ui";
import { Icon } from "@/components/Icon";
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
    </Card>
  );
}
