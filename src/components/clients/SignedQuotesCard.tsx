"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/fetcher";
import { Card, Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import UploadProgress from "@/components/UploadProgress";
import { uploadFileWithProgress, newUploadId, type UploadRow } from "@/lib/uploadWithProgress";

interface Quote {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  note: string | null;
  source: string;
  uploadedBy: string | null;
  isImage: boolean;
  url: string;
  createdAt: string;
}

// כרטיס הצעות מחיר חתומות — מנהלים בלבד. העלאה ידנית (כמה קבצים, מד אחוזים),
// תצוגה מקדימה לתמונות / פתיחה ל-PDF, הורדה ומחיקה.
export default function SignedQuotesCard({ clientId }: { clientId: string }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ quotes: Quote[] }>(`/api/signed-quotes?clientId=${clientId}`);
      setQuotes(d.quotes);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function upload(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setError("");
    const rows: UploadRow[] = list.map((f) => ({ id: newUploadId(), name: f.name, pct: 0, status: "uploading" }));
    setUploads((u) => [...u, ...rows]);
    const upd = (id: string, patch: Partial<UploadRow>) =>
      setUploads((u) => u.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const row = rows[i];
      try {
        const res = await uploadFileWithProgress(file, { category: "signed-quote" }, (pct) => upd(row.id, { pct }));
        upd(row.id, { pct: 100, status: "finalizing" });
        await api("/api/signed-quotes", {
          method: "POST",
          json: { clientId, fileKey: res.key, fileName: res.fileName, mimeType: res.mimeType, size: file.size },
        });
        upd(row.id, { status: "done" });
      } catch (e: any) {
        upd(row.id, { status: "error", error: e.message });
        setError(e.message);
      }
    }
    await load();
    setTimeout(() => setUploads((u) => u.filter((x) => x.status === "error")), 2500);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function remove(q: Quote) {
    if (!confirm(`למחוק את ״${q.fileName}״? הפעולה אינה הפיכה.`)) return;
    setQuotes((qs) => qs.filter((x) => x.id !== q.id));
    try {
      await api(`/api/signed-quotes/${q.id}`, { method: "DELETE" });
    } catch {
      load();
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800">📄 הצעות מחיר חתומות</h3>
          <p className="text-xs text-slate-400">גלוי למנהלים בלבד · כמה הצעות לכל לקוח · העלאה ידנית או דרך בוט הוואטסאפ</p>
        </div>
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" className="h-4 w-4" /> העלאת הצעה חתומה
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      {error ? <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
      {uploads.length > 0 ? <div className="mb-2"><UploadProgress rows={uploads} /></div> : null}

      {loading ? (
        <p className="py-4 text-center text-xs text-slate-400">טוען…</p>
      ) : quotes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-400">
          עדיין לא הועלו הצעות מחיר חתומות. לחצו ״העלאת הצעה חתומה״, או שלחו לבוט ״הצעה: שם הלקוח״ עם צילום/קובץ.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {quotes.map((q) => (
            <div key={q.id} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white">
              <a href={q.url} target="_blank" rel="noopener noreferrer" className="block">
                {q.isImage ? (
                  <img src={q.url} alt={q.fileName} className="h-28 w-full object-cover" />
                ) : (
                  <div className="flex h-28 w-full flex-col items-center justify-center bg-slate-50 text-slate-400">
                    <Icon name="doc" className="h-8 w-8" />
                    <span className="mt-1 text-[10px]">PDF</span>
                  </div>
                )}
              </a>
              <div className="flex items-center gap-1 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600" title={q.fileName}>
                  {q.source === "whatsapp" ? "💬 " : ""}{q.fileName}
                </span>
                <a href={`${q.url}?download=1`} title="הורדה" className="text-slate-400 hover:text-[#3a5bd9]">
                  <Icon name="download" className="h-3.5 w-3.5" />
                </a>
                <button onClick={() => remove(q)} title="מחיקה" className="text-slate-300 hover:text-rose-500">
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
