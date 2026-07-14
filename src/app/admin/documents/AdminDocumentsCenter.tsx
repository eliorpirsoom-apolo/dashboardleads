"use client";

import { useState } from "react";
import { Field, Select, EmptyState } from "@/components/ui";
import DocumentsView from "@/components/documents/DocumentsView";

export default function AdminDocumentsCenter({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div className="glass max-w-sm rounded-2xl p-4">
        <Field label="לקוח">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      {clientId ? (
        <DocumentsView key={clientId} clientId={clientId} canUpload canDelete />
      ) : (
        <EmptyState icon="folder" title="אין לקוחות פעילים" />
      )}
    </div>
  );
}
