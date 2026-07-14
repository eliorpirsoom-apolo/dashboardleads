"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/fetcher";
import { Button, Card } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ClientFormModal } from "@/components/clients/ClientsGrid";

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
  };
}) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);

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
        <div>
          <h3 className="text-base font-bold text-slate-100">פרטי הלקוח</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {client.company ?? client.name}
            {client.contactEmail ? ` · ${client.contactEmail}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
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
