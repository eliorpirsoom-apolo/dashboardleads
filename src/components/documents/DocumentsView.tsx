"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDate, formatMonthKey } from "@/lib/format";
import { DOCUMENT_CATEGORIES } from "@/lib/defaults";
import { Button, EmptyState, Field, Input, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

interface Doc {
  id: string;
  category: string;
  title: string;
  month: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: { name: string } | null;
  project: { name: string } | null;
}

const TABS = [
  { value: "", label: "הכול" },
  ...DOCUMENT_CATEGORIES.filter((c) => c.value !== "logo").map((c) => ({
    value: c.value,
    label: c.label,
  })),
];

function sizeLabel(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export default function DocumentsView({
  clientId,
  canUpload,
  canDelete,
}: {
  clientId: string;
  canUpload: boolean;
  canDelete: boolean;
}) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tab, setTab] = useState("");
  const [error, setError] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ clientId });
      if (tab) p.set("category", tab);
      const d = await api<{ documents: Doc[] }>(`/api/documents?${p}`);
      setDocs(d.documents);
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId, tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("למחוק את הקובץ?")) return;
    try {
      await api(`/api/documents/${id}`, { method: "DELETE" });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Receipts are grouped by month; other categories by category.
  const groups = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const d of docs) {
      const key = d.month
        ? formatMonthKey(d.month)
        : DOCUMENT_CATEGORIES.find((c) => c.value === d.category)?.label ?? "אחר";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return [...map.entries()];
  }, [docs]);

  return (
    <div className="flex flex-col gap-4">
      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
              tab === t.value
                ? "bg-cyan-500/15 text-cyan-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.3)]"
                : "text-slate-400 hover:bg-slate-800/60"
            }`}
          >
            {t.label}
          </button>
        ))}
        {canUpload ? (
          <div className="mr-auto">
            <Button size="sm" onClick={() => setShowUpload(true)}>
              <Icon name="upload" className="h-4 w-4" />
              העלאת קובץ
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {docs.length === 0 ? (
        <div className="glass rounded-2xl p-2">
          <EmptyState
            icon="folder"
            title="אין מסמכים"
            hint="הסכמים, חשבוניות וקבלות שיועלו יופיעו כאן, מסודרים לפי חודשים."
          />
        </div>
      ) : (
        groups.map(([group, groupDocs]) => (
          <div key={group}>
            <h3 className="mb-2 text-sm font-bold text-slate-400">{group}</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {groupDocs.map((d) => (
                <div key={d.id} className="glass glass-hover flex items-center gap-3 rounded-xl p-3">
                  <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-300">
                    <Icon name="doc" className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/files/${d.id}`}
                      target="_blank"
                      className="block truncate text-sm font-medium text-slate-200 hover:text-cyan-300"
                      title={d.title}
                    >
                      {d.title}
                    </a>
                    <p className="text-[11px] text-slate-500">
                      {formatDate(d.createdAt)} · {sizeLabel(d.size)}
                      {d.uploadedBy ? ` · ${d.uploadedBy.name}` : ""}
                    </p>
                  </div>
                  <a
                    href={`/api/files/${d.id}`}
                    target="_blank"
                    className="rounded p-1.5 text-slate-500 hover:text-cyan-300"
                    title="פתיחה"
                  >
                    <Icon name="download" className="h-4 w-4" />
                  </a>
                  {canDelete ? (
                    <button
                      onClick={() => remove(d.id)}
                      className="rounded p-1.5 text-slate-500 hover:text-red-400"
                      title="מחיקה"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {showUpload ? (
        <UploadModal
          clientId={clientId}
          defaultCategory={tab || "invoice"}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

export function UploadModal({
  clientId,
  defaultCategory,
  projectId,
  unitTypeId,
  onClose,
  onUploaded,
}: {
  clientId: string;
  defaultCategory: string;
  projectId?: string;
  unitTypeId?: string;
  onClose: () => void;
  onUploaded: (docId: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState(defaultCategory);
  const [title, setTitle] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const needsMonth = category.startsWith("receipt_") || category === "invoice";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      // 1. Ask where to PUT the bytes (R2 presigned / local dev sink).
      const { target, key } = await api<{ target: any; key: string }>(
        "/api/uploads/presign",
        {
          method: "POST",
          json: {
            clientId,
            category,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
          },
        }
      );

      // 2. Upload the bytes directly.
      const up = await fetch(target.url, {
        method: target.method,
        headers: target.headers,
        body: file,
      });
      if (!up.ok) throw new Error("העלאת הקובץ נכשלה");

      // 3. Register metadata.
      const { document } = await api<{ document: { id: string } }>(
        "/api/documents",
        {
          method: "POST",
          json: {
            clientId,
            category,
            title: title || file.name,
            month: needsMonth ? month : null,
            fileKey: key,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            projectId: projectId ?? null,
            unitTypeId: unitTypeId ?? null,
          },
        }
      );
      onUploaded(document.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="העלאת קובץ" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-600 py-8 transition hover:border-cyan-500/50">
          <Icon name="upload" className="h-7 w-7 text-slate-500" />
          <span className="text-sm text-slate-300">
            {file ? file.name : "בחרו קובץ (עד 25MB)"}
          </span>
          <input
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <Field label="קטגוריה">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </Field>

        {needsMonth ? (
          <Field label="חודש" hint="קבלות וחשבוניות מוצגות ללקוח לפי חודשים">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
        ) : null}

        <Field label="כותרת (אופציונלי)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ברירת מחדל: שם הקובץ" />
        </Field>

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy || !file}>
            {busy ? "מעלה…" : "העלאה"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
