"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/fetcher";
import { clientTypeLabel, CLIENT_TYPES } from "@/lib/modules";
import { Button, Chip, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

export interface ClientCard {
  id: string;
  name: string;
  type: string;
  company: string | null;
  contactName: string | null;
  color: string | null;
  active: boolean;
  newLeadsWeek: number;
  openTasks: number;
  _count: { users: number; leads: number };
}

const TYPE_COLORS: Record<string, string> = {
  general: "#a78bfa",
  realestate: "#22d3ee",
  seo: "#34d399",
};

export default function ClientsGrid({ clients }: { clients: ClientCard[] }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [q, setQ] = useState("");

  const filtered = clients.filter(
    (c) =>
      c.name.includes(q) ||
      (c.company ?? "").includes(q) ||
      (c.contactName ?? "").includes(q)
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לקוח…" />
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Icon name="plus" className="h-4 w-4" />
          לקוח חדש
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="users" title="אין לקוחות" hint="צרו את הלקוח הראשון כדי להתחיל." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/admin/clients/${c.id}`}
              className={`glass glass-hover block rounded-2xl p-4 ${c.active ? "" : "opacity-50"}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-white"
                    style={{ backgroundColor: c.color ?? "#334155" }}
                  >
                    {c.name.slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-bold text-slate-100">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.contactName ?? c.company ?? ""}</p>
                  </div>
                </div>
                <Chip color={TYPE_COLORS[c.type] ?? "#64748b"}>{clientTypeLabel(c.type)}</Chip>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-900/50 py-2">
                  <p className="text-lg font-bold text-cyan-300">{c.newLeadsWeek}</p>
                  <p className="text-[10px] text-slate-500">לידים השבוע</p>
                </div>
                <div className="rounded-xl bg-slate-900/50 py-2">
                  <p className="text-lg font-bold text-slate-200">{c._count.leads}</p>
                  <p className="text-[10px] text-slate-500">סה&quot;כ לידים</p>
                </div>
                <div className="rounded-xl bg-slate-900/50 py-2">
                  <p className="text-lg font-bold text-amber-300">{c.openTasks}</p>
                  <p className="text-[10px] text-slate-500">משימות פתוחות</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate ? (
        <ClientFormModal
          onClose={() => setShowCreate(false)}
          onSaved={(id) => {
            setShowCreate(false);
            router.push(`/admin/clients/${id}`);
          }}
        />
      ) : null}
    </>
  );
}

export function ClientFormModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: {
    id: string;
    name: string;
    type: string;
    company: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    color: string | null;
    notes: string | null;
    birthday?: string | null;
  };
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    type: existing?.type ?? "general",
    company: existing?.company ?? "",
    contactName: existing?.contactName ?? "",
    contactEmail: existing?.contactEmail ?? "",
    contactPhone: existing?.contactPhone ?? "",
    color: existing?.color ?? "#22d3ee",
    notes: existing?.notes ?? "",
    birthday: existing?.birthday ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (existing) {
        await api(`/api/clients/${existing.id}`, { method: "PATCH", json: form });
        onSaved(existing.id);
      } else {
        const d = await api<{ client: { id: string } }>("/api/clients", {
          method: "POST",
          json: form,
        });
        onSaved(d.client.id);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={existing ? "עריכת לקוח" : "לקוח חדש"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="שם הלקוח">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="סוג לקוח" hint="קובע אילו מודולים פעילים">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {CLIENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="חברה (אופציונלי)">
          <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="איש קשר">
            <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </Field>
          <Field label="טלפון">
            <Input dir="ltr" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </Field>
        </div>
        <Field label="תאריך לידה (לברכת יום הולדת אוטומטית)" hint="נשלחת ברכה במייל וב-SMS בבוקר יום ההולדת">
          <Input dir="ltr" type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
        </Field>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="אימייל">
            <Input dir="ltr" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          </Field>
          <Field label="צבע">
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="h-9 w-14 cursor-pointer rounded-lg border border-slate-700 bg-slate-900"
            />
          </Field>
        </div>
        <Field label="הערות פנימיות (רק המשרד רואה)">
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "שומר…" : existing ? "שמירה" : "יצירת לקוח"}</Button>
        </div>
      </form>
    </Modal>
  );
}
