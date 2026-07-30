"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  mimeType: string | null;
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
interface Msg {
  id: string;
  authorSide: string;
  authorName: string | null;
  body: string;
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
  clientPhone: string | null;
  designer: { id: string; name: string } | null;
  assets: Asset[];
  feedback: Fb[];
  messages: Msg[];
}

// מספר ישראלי → קישור wa.me (פורמט בינ"ל בלי + וללא 0 מוביל).
function waLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("972")
    ? digits
    : digits.startsWith("0")
      ? `972${digits.slice(1)}`
      : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

function isImage(a: Asset): boolean {
  if (a.mimeType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(a.fileName || "");
}

// גלריית מדיה — תמונות כתמונות ממוזערות, שאר הקבצים ככרטיסים.
function MediaGrid({ assets, onDelete }: { assets: Asset[]; onDelete?: (id: string) => void }) {
  if (assets.length === 0) return <p className="text-xs text-slate-600">אין קבצים.</p>;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {assets.map((a) => (
        <div key={a.id} className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <a href={`/api/design-assets/${a.id}`} target="_blank" rel="noopener noreferrer" className="block">
            {isImage(a) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/design-assets/${a.id}`}
                alt={a.fileName || "asset"}
                className="h-28 w-full bg-slate-800 object-cover transition group-hover:opacity-90"
              />
            ) : (
              <div className="flex h-28 w-full flex-col items-center justify-center gap-1 text-slate-400 transition group-hover:text-cyan-300">
                <Icon name="doc" className="h-8 w-8" />
                <span className="px-2 text-center text-[10px]">קובץ</span>
              </div>
            )}
            <div className="truncate px-2 py-1.5 text-[11px] text-slate-300">{a.fileName}</div>
          </a>
          {onDelete ? (
            <button
              onClick={() => onDelete(a.id)}
              title="מחיקה"
              className="absolute left-1 top-1 rounded-md bg-slate-950/70 p-1 text-slate-400 opacity-0 transition hover:text-rose-400 group-hover:opacity-100"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
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
  const [tab, setTab] = useState<"updates" | "chat">("chat");
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const refFileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const d = await api<{ task: Detail }>(`/api/design-tasks/${taskId}`);
    setT(d.task);
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === "chat") chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [tab, t?.messages.length]);

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

  async function sendChat() {
    const body = chatText.trim();
    if (!body) return;
    setChatBusy(true);
    try {
      await api(`/api/design-tasks/${taskId}/messages`, { method: "POST", json: { body } });
      setChatText("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setChatBusy(false);
    }
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

  // פיד עדכונים כרונולוגי (חדש→ישן): הודעות, פידבק והעלאות קבצים.
  const feed = useMemo(() => {
    if (!t) return [];
    const items: { id: string; at: string; type: "message" | "feedback" | "asset"; label: string; body: string | null }[] = [];
    for (const m of t.messages) {
      items.push({
        id: `m${m.id}`,
        at: m.createdAt,
        type: "message",
        label: m.authorSide === "client" ? `💬 ${m.authorName || "הלקוח"} (לקוח)` : `💬 ${m.authorName || "המשרד"} (משרד)`,
        body: m.body,
      });
    }
    for (const f of t.feedback) {
      items.push({
        id: `f${f.id}`,
        at: f.createdAt,
        type: "feedback",
        label: f.decision === "approved" ? "✅ הלקוח אישר את העיצוב" : `✏️ הלקוח ביקש שינויים (סבב ${f.round})`,
        body: f.text,
      });
    }
    for (const a of t.assets) {
      const kindLabel = a.kind === "reference" ? "רפרנס" : a.kind === "feedback" ? "צרופת לקוח" : "תוצר";
      items.push({
        id: `a${a.id}`,
        at: a.createdAt,
        type: "asset",
        label: `📎 הועלה ${kindLabel}`,
        body: a.fileName,
      });
    }
    return items.sort((x, y) => (x.at < y.at ? 1 : -1));
  }, [t]);

  if (!t) return null;
  const inQc = t.status === "final_review" || t.status === "qc";
  const allChecked = QC_ITEMS.every((_, i) => qc[i]);
  const references = t.assets.filter((a) => a.kind === "reference");
  const deliverables = t.assets.filter((a) => a.kind === "deliverable");
  const clientAttachments = t.assets.filter((a) => a.kind === "feedback");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const waHref = t.clientPhone
    ? waLink(
        t.clientPhone,
        `שלום${t.client?.name ? ` ${t.client.name}` : ""}, מדברים מאפולו פרסום לגבי העיצוב "${t.title}".` +
          (t.status === "sent_to_client" ? ` לצפייה ואישור: ${origin}/app/studio` : "")
      )
    : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-slate-100">{t.title}</h2>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {t.client?.name} · {briefTypeLabel(t.briefType)} · {DESIGN_STATUS_LABELS[t.status]}
            {t.designer ? ` · ${t.designer.name}` : ""}
            {t.round > 1 ? ` · סבב ${t.round}` : ""}
          </p>
        </div>
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-600/15 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-600/25 sm:flex"
          >
            <Icon name="whatsapp" className="h-4 w-4" />
            וואטסאפ ללקוח
          </a>
        ) : null}
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-slate-100"
        >
          ✕ סגירה
        </button>
      </header>

      {error ? <p className="border-b border-red-900/40 bg-red-950/20 px-6 py-2 text-sm text-red-400">{error}</p> : null}

      {/* Body: main + side */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Main column */}
        <main className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-600/15 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-600/25 sm:hidden"
            >
              <Icon name="whatsapp" className="h-4 w-4" />
              וואטסאפ ללקוח
            </a>
          ) : null}

          {t.brief ? (
            <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="mb-1 text-xs font-bold text-slate-400">בריף</p>
              <p className="whitespace-pre-line text-sm text-slate-200">{t.brief}</p>
              {t.specs ? <p className="mt-2 text-xs text-slate-500">מפרט: {t.specs}</p> : null}
            </div>
          ) : null}

          {/* References */}
          <section className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-300">רפרנסים / דוגמאות למעצב/ת ({references.length})</p>
              <input ref={refFileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "reference")} />
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => refFileRef.current?.click()}>
                <Icon name="upload" className="h-4 w-4" />
                הוספת רפרנס
              </Button>
            </div>
            <MediaGrid assets={references} onDelete={delAsset} />
          </section>

          {/* Deliverables */}
          <section className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-300">תוצרים ({deliverables.length})</p>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Icon name="upload" className="h-4 w-4" />
                העלאת תוצר
              </Button>
            </div>
            <MediaGrid assets={deliverables} onDelete={delAsset} />
          </section>

          {/* Client attachments (screenshots with fix instructions) */}
          {clientAttachments.length > 0 ? (
            <section className="mb-5">
              <p className="mb-2 text-sm font-bold text-slate-300">צרופות מהלקוח ({clientAttachments.length})</p>
              <MediaGrid assets={clientAttachments} />
            </section>
          ) : null}

          <Button className="mb-4 w-full" disabled={busy || deliverables.length === 0} onClick={sendToClient}>
            <Icon name="check" className="h-4 w-4" />
            שליחה ללקוח לאישור
          </Button>

          {/* QC checklist */}
          {inQc ? (
            <div className="mb-2 rounded-xl border border-yellow-800/40 bg-yellow-950/10 p-4">
              <p className="mb-2 text-sm font-bold text-yellow-300">בקרת איכות (QC) לפני אישור סופי</p>
              <div className="mb-2 flex flex-col gap-1.5">
                {QC_ITEMS.map((it, i) => (
                  <label key={i} className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                    <input type="checkbox" checked={!!qc[i]} onChange={(e) => setQc((p) => ({ ...p, [i]: e.target.checked }))} className="h-4 w-4 accent-emerald-500" />
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
              {!allChecked ? <p className="mt-1 text-[11px] text-slate-500">סמנו את כל הפריטים כדי לאשר סופית.</p> : null}
            </div>
          ) : null}
        </main>

        {/* Side column: updates + chat */}
        <aside className="flex min-h-0 flex-1 flex-col border-t border-slate-800 lg:max-w-[440px] lg:flex-none lg:border-r lg:border-t-0">
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setTab("chat")}
              className={`flex-1 py-3 text-sm font-medium transition ${tab === "chat" ? "border-b-2 border-cyan-400 text-cyan-200" : "text-slate-500 hover:text-slate-300"}`}
            >
              צ׳אט מול הלקוח
            </button>
            <button
              onClick={() => setTab("updates")}
              className={`flex-1 py-3 text-sm font-medium transition ${tab === "updates" ? "border-b-2 border-cyan-400 text-cyan-200" : "text-slate-500 hover:text-slate-300"}`}
            >
              עדכונים ({feed.length})
            </button>
          </div>

          {tab === "updates" ? (
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4">
              <div className="flex flex-col gap-2">
                {feed.map((it) => (
                  <div key={it.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-slate-300">{it.label}</span>
                      <span className="mr-auto text-slate-600">{formatDateTime(it.at)}</span>
                    </div>
                    {it.body ? <p className="mt-1 whitespace-pre-line text-sm text-slate-200">{it.body}</p> : null}
                  </div>
                ))}
                {feed.length === 0 ? <p className="text-xs text-slate-600">אין עדכונים עדיין.</p> : null}
              </div>
            </div>
          ) : (
            <>
              <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4">
                <div className="flex flex-col gap-2">
                  {t.messages.map((m) => {
                    const mine = m.authorSide === "agency";
                    return (
                      <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? "self-end border border-cyan-700/40 bg-cyan-600/15" : "self-start border border-slate-700 bg-slate-800/60"}`}>
                        <p className="mb-0.5 text-[10px] text-slate-400">
                          {m.authorName || (mine ? "המשרד" : "הלקוח")} · {formatDateTime(m.createdAt)}
                        </p>
                        <p className="whitespace-pre-line text-sm text-slate-100">{m.body}</p>
                      </div>
                    );
                  })}
                  {t.messages.length === 0 ? (
                    <p className="text-center text-xs text-slate-600">אין עדיין הודעות. פתחו שיחה עם הלקוח 👇</p>
                  ) : null}
                  <div ref={chatEndRef} />
                </div>
              </div>
              <div className="border-t border-slate-800 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChat();
                      }
                    }}
                    rows={2}
                    placeholder="כתבו הודעה ללקוח… (Enter לשליחה)"
                    className="thin-scroll max-h-32 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                  />
                  <Button disabled={chatBusy || !chatText.trim()} onClick={sendChat}>
                    שליחה
                  </Button>
                </div>
                <p className="mt-1 text-[10px] text-slate-600">הלקוח רואה ומשיב מפורטל האישורים שלו.</p>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
