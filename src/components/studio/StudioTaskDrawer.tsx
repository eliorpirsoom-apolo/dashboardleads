"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Chip } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { DESIGN_STATUS_LABELS, briefTypeLabel } from "@/lib/studio";

interface Asset {
  id: string;
  kind: string;
  feedbackId: string | null;
  fileName: string | null;
  round: number;
  createdAt: string;
}
interface Fb {
  id: string;
  round: number;
  decision: string;
  text: string | null;
  authorName: string | null;
  createdAt: string;
}
interface Detail {
  id: string;
  title: string;
  briefType: string;
  brief: string | null;
  specs: string | null;
  status: string;
  round: number;
  client: { id: string; name: string } | null;
  designer: { id: string; name: string } | null;
  assets: Asset[];
  feedback: Fb[];
}

export default function StudioTaskDrawer({
  taskId,
  onClose,
  onChanged,
}: {
  taskId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [t, setT] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qc, setQc] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const refFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const d = await api<{ task: Detail }>(`/api/design-tasks/${taskId}`);
    setT(d.task);
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(file: File, kind: "deliverable" | "reference" = "deliverable") {
    if (!t?.client) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "design");
      fd.append("clientId", t.client.id);
      const up = await fetch("/api/uploads/direct", { method: "POST", body: fd });
      const uj = await up.json();
      if (!up.ok) throw new Error(uj.error || "העלאה נכשלה");
      await api(`/api/design-tasks/${taskId}/assets`, {
        method: "POST",
        json: { fileKey: uj.key, fileName: uj.fileName, mimeType: uj.mimeType, kind },
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendToClient() {
    if (!confirm("לשלוח ללקוח לאישור? תישלח התראה עם קישור לצפייה.")) return;
    setBusy(true);
    try {
      await api(`/api/design-tasks/${taskId}`, { method: "PATCH", json: { status: "sent_to_client" } });
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function delAsset(id: string) {
    await api(`/api/design-assets/${id}`, { method: "DELETE" });
    load();
  }

  async function approveFinal() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/design-tasks/${taskId}`, { method: "PATCH", json: { status: "approved" } });
      await load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function rejectToFix() {
    if (!t) return;
    setBusy(true);
    try {
      await api(`/api/design-tasks/${taskId}`, {
        method: "PATCH",
        json: { status: "in_progress", round: t.round + 1 },
      });
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const QC_ITEMS = [
    "הטקסטים תקינים ומאושרים",
    "מידות ופורמט נכונים",
    "מיתוג, לוגו וצבעים לפי המותג",
    "ללא שגיאות כתיב/עיצוב",
    "איכות הקבצים תקינה למסירה",
  ];

  if (!t) return null;
  const inQc = t.status === "final_review" || t.status === "qc";
  const allChecked = QC_ITEMS.every((_, i) => qc[i]);
  const references = t.assets.filter((a) => a.kind === "reference");
  const deliverables = t.assets.filter((a) => a.kind === "deliverable");
  const fbAttachments = (fbId: string) =>
    t.assets.filter((a) => a.kind === "feedback" && a.feedbackId === fbId);

  return (
    <div className="fixed inset-0 z-50 flex justify-start" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <aside
        className="thin-scroll relative h-full w-full max-w-md overflow-y-auto border-l border-slate-800 bg-slate-950 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100">{t.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {t.client?.name} · {briefTypeLabel(t.briefType)} · {DESIGN_STATUS_LABELS[t.status]}
              {t.round > 1 ? ` · סבב ${t.round}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-lg text-slate-500 hover:text-slate-200">
            ✕
          </button>
        </div>

        {error ? <p className="mb-2 text-sm text-red-400">{error}</p> : null}

        {t.brief ? (
          <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
            <p className="mb-1 text-xs font-bold text-slate-400">בריף</p>
            <p className="whitespace-pre-line text-sm text-slate-200">{t.brief}</p>
            {t.specs ? <p className="mt-2 text-xs text-slate-500">מפרט: {t.specs}</p> : null}
          </div>
        ) : null}

        {/* Reference files — מהמשרד למעצב/ת */}
        <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400">רפרנסים / דוגמאות למעצב/ת ({references.length})</p>
            <input
              ref={refFileRef}
              type="file"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "reference")}
            />
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => refFileRef.current?.click()}>
              <Icon name="upload" className="h-4 w-4" />
              הוספת רפרנס
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            {references.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-1.5 text-xs">
                <Icon name="doc" className="h-4 w-4 text-violet-400" />
                <a href={`/api/design-assets/${a.id}`} target="_blank" className="flex-1 truncate text-slate-200 hover:text-cyan-300">
                  {a.fileName}
                </a>
                <button onClick={() => delAsset(a.id)} className="text-slate-600 hover:text-rose-400">
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {references.length === 0 ? <p className="text-xs text-slate-600">אין רפרנסים.</p> : null}
          </div>
        </div>

        {/* Deliverables — תוצרים מהמעצב/ת ללקוח */}
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400">תוצרים ({deliverables.length})</p>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Icon name="upload" className="h-4 w-4" />
              העלאת תוצר
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            {deliverables.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs">
                <Icon name="doc" className="h-4 w-4 text-cyan-400" />
                <a href={`/api/design-assets/${a.id}`} target="_blank" className="flex-1 truncate text-slate-200 hover:text-cyan-300">
                  {a.fileName}
                </a>
                <span className="text-slate-600">סבב {a.round}</span>
                <button onClick={() => delAsset(a.id)} className="text-slate-600 hover:text-rose-400">
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {deliverables.length === 0 ? <p className="text-xs text-slate-600">אין תוצרים עדיין.</p> : null}
          </div>
        </div>

        <Button className="mb-4 w-full" disabled={busy || deliverables.length === 0} onClick={sendToClient}>
          <Icon name="whatsapp" className="h-4 w-4" />
          שליחה ללקוח לאישור
        </Button>

        {/* QC checklist — לפני אישור סופי */}
        {inQc ? (
          <div className="mb-4 rounded-xl border border-yellow-800/40 bg-yellow-950/10 p-3">
            <p className="mb-2 text-xs font-bold text-yellow-300">בקרת איכות (QC) לפני אישור סופי</p>
            <div className="mb-2 flex flex-col gap-1.5">
              {QC_ITEMS.map((it, i) => (
                <label key={i} className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={!!qc[i]}
                    onChange={(e) => setQc((p) => ({ ...p, [i]: e.target.checked }))}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  {it}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !allChecked} onClick={approveFinal}>
                <Icon name="check" className="h-4 w-4" />
                אישור סופי
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={rejectToFix}>
                החזרה לתיקון
              </Button>
            </div>
            {!allChecked ? (
              <p className="mt-1 text-[11px] text-slate-500">סמנו את כל הפריטים כדי לאשר סופית.</p>
            ) : null}
          </div>
        ) : null}

        {/* Feedback history */}
        <p className="mb-1 text-xs font-bold text-slate-400">פידבק מהלקוח</p>
        <div className="flex flex-col gap-2">
          {t.feedback.map((f) => (
            <div key={f.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs">
                <Chip color={f.decision === "approved" ? "#34d399" : "#f97316"}>
                  {f.decision === "approved" ? "אושר ✓" : "בקשת שינויים"}
                </Chip>
                <span className="text-slate-500">סבב {f.round}</span>
                <span className="mr-auto text-slate-600">{formatDateTime(f.createdAt)}</span>
              </div>
              {f.text ? <p className="whitespace-pre-line text-sm text-slate-200">{f.text}</p> : null}
              {fbAttachments(f.id).length > 0 ? (
                <div className="mt-2 flex flex-col gap-1">
                  {fbAttachments(f.id).map((a) => (
                    <a
                      key={a.id}
                      href={`/api/design-assets/${a.id}`}
                      target="_blank"
                      className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-1.5 text-xs text-slate-200 hover:text-cyan-300"
                    >
                      <Icon name="doc" className="h-4 w-4 text-orange-400" />
                      <span className="flex-1 truncate">{a.fileName}</span>
                      <span className="text-slate-600">צפייה ←</span>
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {t.feedback.length === 0 ? <p className="text-xs text-slate-600">טרם התקבל פידבק.</p> : null}
        </div>
      </aside>
    </div>
  );
}
