"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/fetcher";
import { Card, Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { useCollapse, CollapseBtn } from "@/components/settings/Collapse";
import UploadProgress from "@/components/UploadProgress";
import { uploadFileWithProgress, newUploadId, type UploadRow } from "@/lib/uploadWithProgress";
import { formatCurrency, formatDate } from "@/lib/format";

interface Quote {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  title: string | null;
  amountPreVat: number | null;
  amountTotal: number | null;
  quoteDate: string;
  note: string | null;
  source: string;
  uploadedBy: string | null;
  isImage: boolean;
  url: string;
  createdAt: string;
}

const VAT = 0.18; // מע"מ ישראל

function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// כרטיס הצעות מחיר חתומות — מנהלים בלבד. העלאה ידנית (כמה קבצים, מד אחוזים),
// שדות מסודרים (נושא/סכום/תאריך) שנראים מבחוץ, עריכה בתוך הכרטיס, מזעור.
export default function SignedQuotesCard({ clientId }: { clientId: string }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [collapsed, toggle] = useCollapse(`signed-quotes-${clientId}`);

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
    if (!confirm(`למחוק את ההצעה${q.title ? ` ״${q.title}״` : ""}? הפעולה אינה הפיכה.`)) return;
    setQuotes((qs) => qs.filter((x) => x.id !== q.id));
    try {
      await api(`/api/signed-quotes/${q.id}`, { method: "DELETE" });
    } catch {
      load();
    }
  }

  const totalSum = quotes.reduce((s, q) => s + (q.amountTotal ?? 0), 0);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CollapseBtn collapsed={collapsed} onClick={toggle} />
          <div>
            <h3 className="text-sm font-bold text-slate-800">📄 הצעות מחיר חתומות</h3>
            <p className="text-xs text-slate-400">
              גלוי למנהלים בלבד
              {quotes.length > 0 ? (
                <>
                  {" · "}
                  <span className="font-semibold text-slate-500">{quotes.length} הצעות</span>
                  {totalSum > 0 ? <> · סה״כ <span className="font-semibold text-[#3a5bd9]">{formatCurrency(totalSum)}</span></> : null}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" className="h-4 w-4" /> העלאת הצעה
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

      {collapsed ? null : (
        <div className="mt-3">
          {error ? <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
          {uploads.length > 0 ? <div className="mb-2"><UploadProgress rows={uploads} /></div> : null}

          {loading ? (
            <p className="py-4 text-center text-xs text-slate-400">טוען…</p>
          ) : quotes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-400">
              עדיין לא הועלו הצעות מחיר חתומות. לחצו ״העלאת הצעה״, או שלחו לבוט ״הצעה: שם הלקוח״ עם צילום/קובץ.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {quotes.map((q) =>
                editId === q.id ? (
                  <QuoteEditRow key={q.id} quote={q} onCancel={() => setEditId(null)} onSaved={() => { setEditId(null); load(); }} />
                ) : (
                  <QuoteRow key={q.id} quote={q} onEdit={() => setEditId(q.id)} onDelete={() => remove(q)} />
                )
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// שורת תצוגה של הצעה — נושא / סכום / תאריך נראים מבחוץ.
function QuoteRow({ quote: q, onEdit, onDelete }: { quote: Quote; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-stretch gap-3 rounded-xl border border-slate-200 bg-white p-2 transition hover:border-slate-300">
      <a href={q.url} target="_blank" rel="noopener noreferrer" className="block shrink-0" title="פתיחה">
        {q.isImage ? (
          <img src={q.url} alt={q.title ?? q.fileName} className="h-16 w-16 rounded-lg object-cover" />
        ) : (
          <div className="flex h-16 w-16 flex-col items-center justify-center rounded-lg bg-slate-50 text-slate-400">
            <Icon name="doc" className="h-6 w-6" />
            <span className="mt-0.5 text-[9px]">PDF</span>
          </div>
        )}
      </a>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        {q.title ? (
          <p className="truncate text-sm font-semibold text-slate-800" title={q.title}>{q.title}</p>
        ) : (
          <button onClick={onEdit} className="self-start text-sm font-medium text-slate-400 hover:text-[#3a5bd9]">➕ הוסף נושא</button>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1"><Icon name="calendar" className="h-3 w-3" />{formatDate(q.quoteDate)}</span>
          <span className={`rounded px-1.5 py-px ${q.source === "whatsapp" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
            {q.source === "whatsapp" ? "💬 וואטסאפ" : "ידני"}
          </span>
          {q.uploadedBy ? <span className="text-slate-400">{q.uploadedBy}</span> : null}
        </div>
        <span className="mt-0.5 truncate text-[10px] text-slate-300" title={q.fileName}>{q.fileName}</span>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-center text-left">
        {q.amountTotal != null ? (
          <span className="text-base font-bold text-slate-800">{formatCurrency(q.amountTotal)}</span>
        ) : (
          <button onClick={onEdit} className="text-xs font-medium text-slate-400 hover:text-[#3a5bd9]">➕ סכום</button>
        )}
        {q.amountTotal != null ? <span className="text-[10px] text-slate-400">כולל מע״מ</span> : null}
        {q.amountPreVat != null ? <span className="text-[10px] text-slate-400">לפני מע״מ: {formatCurrency(q.amountPreVat)}</span> : null}
      </div>

      <div className="flex shrink-0 flex-col items-center justify-center gap-1 border-r border-slate-100 pr-2">
        <a href={`${q.url}?download=1`} title="הורדה" className="text-slate-400 hover:text-[#3a5bd9]"><Icon name="download" className="h-4 w-4" /></a>
        <button onClick={onEdit} title="עריכה" className="text-slate-400 hover:text-[#3a5bd9]"><Icon name="edit" className="h-4 w-4" /></button>
        <button onClick={onDelete} title="מחיקה" className="text-slate-300 hover:text-rose-500"><Icon name="trash" className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// טופס עריכה בתוך הכרטיס — נושא / סכומים / תאריך / הערה.
function QuoteEditRow({ quote: q, onCancel, onSaved }: { quote: Quote; onCancel: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(q.title ?? "");
  const [pre, setPre] = useState(q.amountPreVat != null ? String(q.amountPreVat) : "");
  const [total, setTotal] = useState(q.amountTotal != null ? String(q.amountTotal) : "");
  const [date, setDate] = useState(isoToDateInput(q.quoteDate));
  const [note, setNote] = useState(q.note ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const num = (s: string) => {
    const n = parseInt(s.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  };

  async function save() {
    setSaving(true);
    setErr("");
    try {
      await api(`/api/signed-quotes/${q.id}`, {
        method: "PATCH",
        json: {
          title: title.trim() || null,
          amountPreVat: num(pre),
          amountTotal: num(total),
          quoteDate: date ? new Date(date).toISOString() : null,
          note: note.trim() || null,
        },
      });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
      setSaving(false);
    }
  }

  const inp = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#3a5bd9]";

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#3a5bd9]/40 bg-[#3a5bd9]/5 p-3">
      <input className={inp} placeholder="נושא ההצעה — על מה היא?" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-0.5 block text-[10px] text-slate-500">סכום לפני מע״מ (₪)</label>
          <input className={inp} inputMode="numeric" placeholder="0" value={pre} onChange={(e) => setPre(e.target.value)} />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] text-slate-500">סכום כולל מע״מ (₪)</label>
          <input className={inp} inputMode="numeric" placeholder="0" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <button type="button" onClick={() => { const p = num(pre); if (p) setTotal(String(Math.round(p * (1 + VAT)))); }} className="rounded bg-slate-100 px-2 py-1 text-slate-600 hover:bg-slate-200">
          חשב כולל ← לפני ×1.18
        </button>
        <button type="button" onClick={() => { const t = num(total); if (t) setPre(String(Math.round(t / (1 + VAT)))); }} className="rounded bg-slate-100 px-2 py-1 text-slate-600 hover:bg-slate-200">
          חשב לפני ← כולל ÷1.18
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-0.5 block text-[10px] text-slate-500">תאריך ההצעה</label>
          <input type="date" className={inp} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] text-slate-500">הערה (לא חובה)</label>
          <input className={inp} placeholder="הערה פנימית" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} disabled={saving} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">
          <Icon name="x" className="h-4 w-4" /> ביטול
        </button>
        <Button size="sm" onClick={save} disabled={saving}>
          <Icon name="check" className="h-4 w-4" /> {saving ? "שומר…" : "שמירה"}
        </Button>
      </div>
    </div>
  );
}
