"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Chip } from "@/components/ui";
import { Icon } from "@/components/Icon";
import RichEditor from "@/components/RichEditor";
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
  channel: string;
  assetId: string | null;
  authorSide: string;
  authorName: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  sharedChannels: string | null;
  sharedAt: string | null;
}
interface WaMsg {
  id: string;
  direction: string;
  body: string;
  authorName: string | null;
  fromPhone: string | null;
  mediaKey: string | null;
  mediaUrl: string | null;
  mediaName: string | null;
  mediaMime: string | null;
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
  clientHasEmail: boolean;
  createdById: string | null;
  createdBy: { id: string; name: string } | null;
  designer: { id: string; name: string } | null;
  assets: Asset[];
  feedback: Fb[];
  messages: Msg[];
}

function isImage(a: Asset): boolean {
  if (a.mimeType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(a.fileName || "");
}

// גלריית מדיה — תמונות כתמונות ממוזערות, שאר הקבצים ככרטיסים.
function MediaGrid({
  assets,
  onDelete,
  commentCount,
  onComment,
  onWhatsapp,
  activeId,
}: {
  assets: Asset[];
  onDelete?: (id: string) => void;
  commentCount?: (id: string) => number;
  onComment?: (id: string) => void;
  onWhatsapp?: (id: string) => void;
  activeId?: string | null;
}) {
  if (assets.length === 0) return <p className="text-xs text-slate-600">אין קבצים.</p>;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {assets.map((a) => {
        const n = commentCount?.(a.id) ?? 0;
        return (
          <div key={a.id} className={`group relative overflow-hidden rounded-xl border bg-slate-50 ${activeId === a.id ? "border-cyan-500/60" : "border-slate-200"}`}>
            <a href={`/api/design-assets/${a.id}`} target="_blank" rel="noopener noreferrer" className="block">
              {isImage(a) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/design-assets/${a.id}`}
                  alt={a.fileName || "asset"}
                  className="h-28 w-full bg-slate-100 object-cover transition group-hover:opacity-90"
                />
              ) : (
                <div className="flex h-28 w-full flex-col items-center justify-center gap-1 text-slate-400 transition group-hover:text-cyan-700">
                  <Icon name="doc" className="h-8 w-8" />
                  <span className="px-2 text-center text-[10px]">קובץ</span>
                </div>
              )}
              <div className="truncate px-2 py-1.5 text-[11px] text-slate-600">{a.fileName}</div>
            </a>
            {onComment ? (
              <button
                onClick={() => onComment(a.id)}
                className="absolute bottom-1 left-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-cyan-700 transition hover:bg-slate-100"
              >
                💬{n ? ` ${n}` : ""}
              </button>
            ) : null}
            {onWhatsapp ? (
              <button
                onClick={() => onWhatsapp(a.id)}
                title="שליחה ללקוח בוואטסאפ"
                className="absolute bottom-1 right-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-emerald-700 transition hover:bg-slate-100"
              >
                וואטסאפ
              </button>
            ) : null}
            {onDelete ? (
              <button
                onClick={() => onDelete(a.id)}
                title="מחיקה"
                className="absolute left-1 top-1 rounded-md bg-slate-100 p-1 text-slate-400 opacity-0 transition hover:text-rose-400 group-hover:opacity-100"
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function StudioTaskDrawer({
  taskId,
  meId,
  onClose,
  onChanged,
}: {
  taskId: string;
  meId?: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [t, setT] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qc, setQc] = useState<Record<number, boolean>>({});
  const [tab, setTab] = useState<"client" | "whatsapp" | "internal">("client");
  const [chatText, setChatText] = useState("");
  const [internalHtml, setInternalHtml] = useState("");
  const [internalSignal, setInternalSignal] = useState(0);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editHtml, setEditHtml] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [blockBusy, setBlockBusy] = useState<string | null>(null); // id של בלוק בפעולה (שליחה/עריכה/מחיקה)
  const [briefDraft, setBriefDraft] = useState<string | null>(null);
  const [briefSaving, setBriefSaving] = useState(false);
  const [editingBrief, setEditingBrief] = useState(false);
  // החלפת לקוח (שיוך שגוי) — נטען את רשימת הלקוחות רק בלחיצה.
  const [changingClient, setChangingClient] = useState(false);
  const [clientOpts, setClientOpts] = useState<{ id: string; name: string }[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [openAsset, setOpenAsset] = useState<string | null>(null);
  const [assetCommentText, setAssetCommentText] = useState("");
  const [waMsgs, setWaMsgs] = useState<WaMsg[]>([]);
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waConfigured, setWaConfigured] = useState(true);
  const [waText, setWaText] = useState("");
  const [waBusy, setWaBusy] = useState(false);
  const [waAvatar, setWaAvatar] = useState<string | null>(null);
  const [waAvatarTried, setWaAvatarTried] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const refFileRef = useRef<HTMLInputElement>(null);
  const waFileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const clientId = t?.client?.id;

  const loadWa = useCallback(async () => {
    if (!clientId) return;
    try {
      const d = await api<{ messages: WaMsg[]; phone: string | null; configured: boolean }>(`/api/whatsapp/${clientId}`);
      setWaMsgs(d.messages);
      setWaPhone(d.phone);
      setWaConfigured(d.configured);
    } catch {
      /* ignore */
    }
  }, [clientId]);

  // רענון שרשור הוואטסאפ בזמן שהטאב פתוח (לקליטת הודעות נכנסות).
  useEffect(() => {
    if (tab !== "whatsapp" || !clientId) return;
    loadWa();
    const iv = setInterval(loadWa, 15000);
    return () => clearInterval(iv);
  }, [tab, clientId, loadWa]);

  // תמונת פרופיל + מספר הלקוח (פעם אחת בפתיחת טאב הוואטסאפ).
  useEffect(() => {
    if (tab !== "whatsapp" || !clientId || waAvatarTried) return;
    setWaAvatarTried(true);
    api<{ phone: string | null; avatarUrl: string | null }>(`/api/whatsapp/${clientId}/avatar`)
      .then((d) => {
        setWaAvatar(d.avatarUrl || null);
        if (d.phone) setWaPhone(d.phone);
      })
      .catch(() => {});
  }, [tab, clientId, waAvatarTried]);

  async function sendWaMedia(payload: { assetId?: string; fileKey?: string; fileName?: string; mimeType?: string | null; caption?: string }) {
    if (!clientId) return;
    setWaBusy(true);
    setError("");
    try {
      await api(`/api/whatsapp/${clientId}/media`, { method: "POST", json: payload });
      await loadWa();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setWaBusy(false);
    }
  }

  async function uploadWaFile(file: File) {
    if (!clientId) return;
    setWaBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "design");
      fd.append("clientId", clientId);
      const up = await fetch("/api/uploads/direct", { method: "POST", body: fd });
      const uj = await up.json();
      if (!up.ok) throw new Error(uj.error || "העלאה נכשלה");
      await sendWaMedia({ fileKey: uj.key, fileName: uj.fileName, mimeType: uj.mimeType });
    } catch (e: any) {
      setError(e.message);
      setWaBusy(false);
    }
  }

  async function sendWa() {
    const body = waText.trim();
    if (!body || !clientId) return;
    setWaBusy(true);
    setError("");
    try {
      await api(`/api/whatsapp/${clientId}`, { method: "POST", json: { body } });
      setWaText("");
      await loadWa();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setWaBusy(false);
    }
  }

  const load = useCallback(async () => {
    const d = await api<{ task: Detail }>(`/api/design-tasks/${taskId}`);
    setT(d.task);
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [tab, t?.messages.length, waMsgs.length]);

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
      await api(`/api/design-tasks/${taskId}/messages`, { method: "POST", json: { body, channel: "client" } });
      setChatText("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setChatBusy(false);
    }
  }

  // העלאת תמונה מוטבעת (בריף/עדכונים) → R2 → קישור להגשה מאובטחת.
  // העלאת מדיה לעורך (תמונה/וידאו): קבצים קטנים דרך ה-API, גדולים (וידאו)
  // ישירות ל-R2 עם presign — עוקף את מגבלת ה-4MB של Vercel. עד 25MB.
  async function uploadStudioMedia(file: File): Promise<string | null> {
    if (!clientId) return null;
    if (file.size > 3_500_000) {
      const pres = await api<{ target: { url: string; method: string; headers: Record<string, string> }; key: string }>(
        "/api/uploads/presign",
        {
          method: "POST",
          json: {
            clientId,
            category: "design",
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
          },
        }
      );
      const put = await fetch(pres.target.url, { method: "PUT", headers: pres.target.headers, body: file });
      if (!put.ok) throw new Error("העלאת הקובץ נכשלה");
      return `/api/studio/media?key=${encodeURIComponent(pres.key)}`;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", "design");
    fd.append("clientId", clientId);
    const up = await fetch("/api/uploads/direct", { method: "POST", body: fd });
    const uj = await up.json();
    if (!up.ok) throw new Error(uj.error || "העלאה נכשלה");
    return `/api/studio/media?key=${encodeURIComponent(uj.key)}`;
  }

  const isHtmlEmpty = (html: string) =>
    !/<img\b|<video\b/i.test(html) && html.replace(/<[^>]*>/g, "").replace(/&nbsp;|\s/g, "") === "";

  async function sendInternal() {
    if (isHtmlEmpty(internalHtml)) return;
    setChatBusy(true);
    try {
      await api(`/api/design-tasks/${taskId}/messages`, { method: "POST", json: { body: internalHtml, channel: "internal" } });
      setInternalHtml("");
      setInternalSignal((s) => s + 1);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setChatBusy(false);
    }
  }

  // שליחת תוכן בלוק עדכון ללקוח (מייל/וואטסאפ) — מסמן "נשלח" על הבלוק.
  async function shareBlock(id: string, channel: "email" | "whatsapp") {
    setOpenMenuId(null);
    setBlockBusy(id);
    setError("");
    try {
      await api(`/api/design-tasks/${taskId}/messages/${id}/share`, { method: "POST", json: { channel } });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBlockBusy(null);
    }
  }

  function startEdit(m: Msg) {
    setOpenMenuId(null);
    setEditingMsgId(m.id);
    setEditHtml(m.body);
  }
  function cancelEdit() {
    setEditingMsgId(null);
    setEditHtml("");
  }
  async function saveEdit(id: string) {
    if (isHtmlEmpty(editHtml)) return;
    setBlockBusy(id);
    setError("");
    try {
      await api(`/api/design-tasks/${taskId}/messages/${id}`, { method: "PATCH", json: { body: editHtml } });
      setEditingMsgId(null);
      setEditHtml("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBlockBusy(null);
    }
  }
  async function deleteBlock(id: string) {
    setOpenMenuId(null);
    if (!confirm("למחוק את העדכון? פעולה זו אינה הפיכה.")) return;
    setBlockBusy(id);
    setError("");
    try {
      await api(`/api/design-tasks/${taskId}/messages/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBlockBusy(null);
    }
  }

  // ראשי-תיבות לאווטאר העדכון.
  function initials(name: string | null): string {
    const parts = (name || "משרד").trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]).join("") || "מ";
  }
  // צבע יציב לאווטאר לפי שם.
  function avatarColor(name: string | null): string {
    const palette = ["#3a5bd9", "#0ea5e9", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#14b8a6"];
    const s = name || "משרד";
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }

  // המרת בריף (טקסט ישן או HTML) ל-HTML לעריכה.
  function briefToHtml(brief: string | null | undefined): string {
    if (!brief) return "";
    return /</.test(brief) ? brief : `<p>${brief.replace(/\n/g, "<br>")}</p>`;
  }
  function startEditBrief() {
    setBriefDraft(briefToHtml(t?.brief));
    setEditingBrief(true);
  }
  function cancelEditBrief() {
    setEditingBrief(false);
    setBriefDraft(null);
  }
  async function saveBrief() {
    if (briefDraft === null) {
      setEditingBrief(false);
      return;
    }
    setBriefSaving(true);
    try {
      await api(`/api/design-tasks/${taskId}`, { method: "PATCH", json: { brief: briefDraft } });
      await load();
      setBriefDraft(null);
      setEditingBrief(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBriefSaving(false);
    }
  }

  async function sendAssetComment(assetId: string) {
    const body = assetCommentText.trim();
    if (!body) return;
    setChatBusy(true);
    try {
      await api(`/api/design-tasks/${taskId}/messages`, { method: "POST", json: { body, assetId } });
      setAssetCommentText("");
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

  if (!t) return null;
  const inQc = t.status === "final_review" || t.status === "qc";
  const allChecked = QC_ITEMS.every((_, i) => qc[i]);
  const references = t.assets.filter((a) => a.kind === "reference");
  const deliverables = t.assets.filter((a) => a.kind === "deliverable");
  const clientAttachments = t.assets.filter((a) => a.kind === "feedback");
  const assetMsgs = (id: string) => t.messages.filter((m) => m.channel === "client" && m.assetId === id);
  const clientMsgs = t.messages.filter((m) => m.channel === "client" && !m.assetId);
  const internalMsgs = t.messages.filter((m) => m.channel === "internal");
  const briefInitial = t.brief
    ? /</.test(t.brief)
      ? t.brief
      : `<p>${t.brief.replace(/\n/g, "<br>")}</p>`
    : "";
  // עריכת בריף — רק היוצר/ת (או כל מנהל אם לא תועד יוצר, לתאימות לאחור).
  const canEditBrief = !t.createdById || (!!meId && meId === t.createdById);
  const openAssetName = deliverables.find((a) => a.id === openAsset)?.fileName;
  // שרשור הלקוח: הודעות + החלטות אישור/שינויים, לפי סדר כרונולוגי.
  const clientThread: { id: string; at: string; msg: Msg | null; fb: Fb | null }[] = [
    ...clientMsgs.map((m) => ({ id: `m${m.id}`, at: m.createdAt, msg: m, fb: null as Fb | null })),
    ...t.feedback.map((f) => ({ id: `f${f.id}`, at: f.createdAt, msg: null as Msg | null, fb: f })),
  ].sort((a, b) => (a.at < b.at ? -1 : 1));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f6f7fb]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-slate-800">{t.title}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1 truncate text-xs text-slate-500">
            {changingClient ? (
              <select
                autoFocus
                className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700"
                value={t.client?.id ?? ""}
                onChange={async (e) => {
                  const newId = e.target.value;
                  setChangingClient(false);
                  if (!newId || newId === t.client?.id) return;
                  if (!confirm("להעביר את הבריף ללקוח אחר? שיוך הפרויקט יאופס.")) return;
                  try {
                    await api(`/api/design-tasks/${taskId}`, { method: "PATCH", json: { clientId: newId } });
                    await load();
                    onChanged();
                  } catch (err: any) {
                    setError(err.message);
                  }
                }}
                onBlur={() => setChangingClient(false)}
              >
                {clientOpts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  if (clientOpts.length === 0) {
                    try {
                      const d = await api<{ clients: { id: string; name: string }[] }>("/api/clients");
                      setClientOpts(d.clients.map((c) => ({ id: c.id, name: c.name })));
                    } catch {
                      return;
                    }
                  }
                  setChangingClient(true);
                }}
                className="rounded px-1 text-slate-600 underline decoration-dotted underline-offset-2 hover:text-[#3a5bd9]"
                title="החלפת לקוח (אם נבחר לקוח שגוי)"
              >
                {t.client?.name}
              </button>
            )}
            <span>· {briefTypeLabel(t.briefType)} · {DESIGN_STATUS_LABELS[t.status]}
            {t.designer ? ` · ${t.designer.name}` : ""}
            {t.round > 1 ? ` · סבב ${t.round}` : ""}</span>
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
        >
          ✕ סגירה
        </button>
      </header>

      {error ? <p className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-600">{error}</p> : null}

      {/* Body: main + side */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Main column */}
        <main className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <section className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-700">בריף</p>
                {t.createdBy?.name ? (
                  <span className="text-[11px] text-slate-400">· נוצר ע״י {t.createdBy.name}</span>
                ) : null}
              </div>
              {editingBrief ? (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={cancelEditBrief} className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100">ביטול</button>
                  <Button size="sm" disabled={briefSaving} onClick={saveBrief}>
                    {briefSaving ? "שומר…" : "שמירת בריף"}
                  </Button>
                </div>
              ) : canEditBrief ? (
                <Button size="sm" variant="ghost" onClick={startEditBrief}>
                  <Icon name="edit" className="h-4 w-4" />
                  עריכה
                </Button>
              ) : null}
            </div>
            {editingBrief ? (
              <RichEditor
                key={`brief-${t.id}`}
                value={briefInitial}
                onChange={setBriefDraft}
                uploadImage={uploadStudioMedia}
                placeholder="כתבו בריף — טקסט, תמונות, צילומי מסך, קישורים…"
                minHeight={140}
              />
            ) : briefInitial ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="rich-content" dangerouslySetInnerHTML={{ __html: briefInitial }} />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-400">
                אין בריף עדיין{canEditBrief ? " — לחצו על ״עריכה״ כדי להוסיף." : "."}
              </div>
            )}
            {t.specs ? <p className="mt-2 text-xs text-slate-500">מפרט: {t.specs}</p> : null}
          </section>

          {/* References */}
          <section className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-600">רפרנסים / דוגמאות למעצב/ת ({references.length})</p>
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
              <p className="text-sm font-bold text-slate-600">תוצרים ({deliverables.length})</p>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Icon name="upload" className="h-4 w-4" />
                העלאת תוצר
              </Button>
            </div>
            <MediaGrid
              assets={deliverables}
              onDelete={delAsset}
              commentCount={(id) => assetMsgs(id).length}
              onComment={(id) => setOpenAsset(openAsset === id ? null : id)}
              onWhatsapp={clientId ? (id) => sendWaMedia({ assetId: id }) : undefined}
              activeId={openAsset}
            />
            {openAsset ? (
              <div className="mt-2 rounded-xl border border-cyan-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-bold text-cyan-700">הערות על הקובץ: {openAssetName}</p>
                <div className="mb-2 flex flex-col gap-1.5">
                  {assetMsgs(openAsset).map((m) => (
                    <div key={m.id} className={`rounded-lg px-2.5 py-1.5 text-xs ${m.authorSide === "client" ? "self-start bg-slate-100 text-slate-800" : "self-end bg-cyan-50 text-slate-800"}`}>
                      <span className="text-[10px] text-slate-400">{m.authorName || (m.authorSide === "client" ? "הלקוח" : "המשרד")} · {formatDateTime(m.createdAt)}</span>
                      <p className="whitespace-pre-line">{m.body}</p>
                    </div>
                  ))}
                  {assetMsgs(openAsset).length === 0 ? <p className="text-xs text-slate-600">אין הערות על הקובץ הזה.</p> : null}
                </div>
                <div className="flex items-end gap-2">
                  <input
                    value={assetCommentText}
                    onChange={(e) => setAssetCommentText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sendAssetComment(openAsset); }}
                    placeholder="הערה על הקובץ…"
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                  />
                  <Button size="sm" disabled={chatBusy || !assetCommentText.trim()} onClick={() => sendAssetComment(openAsset)}>
                    שליחה
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          {/* Client attachments (screenshots with fix instructions) */}
          {clientAttachments.length > 0 ? (
            <section className="mb-5">
              <p className="mb-2 text-sm font-bold text-slate-600">צרופות מהלקוח ({clientAttachments.length})</p>
              <MediaGrid assets={clientAttachments} />
            </section>
          ) : null}

          <Button className="mb-4 w-full" disabled={busy || deliverables.length === 0} onClick={sendToClient}>
            <Icon name="check" className="h-4 w-4" />
            שליחה ללקוח לאישור
          </Button>

          {/* QC checklist */}
          {inQc ? (
            <div className="mb-2 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="mb-2 text-sm font-bold text-yellow-700">בקרת איכות (QC) לפני אישור סופי</p>
              <div className="mb-2 flex flex-col gap-1.5">
                {QC_ITEMS.map((it, i) => (
                  <label key={i} className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
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

        {/* Side column: two in-system channels — client chat + internal (agency) chat */}
        <aside className="flex min-h-0 flex-1 flex-col border-t border-slate-200 lg:max-w-[440px] lg:flex-none lg:border-r lg:border-t-0">
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setTab("client")}
              className={`flex-1 py-3 text-xs font-medium transition sm:text-sm ${tab === "client" ? "border-b-2 border-cyan-400 text-cyan-700" : "text-slate-500 hover:text-slate-600"}`}
            >
              צ׳אט לקוח{clientMsgs.length ? ` (${clientMsgs.length})` : ""}
            </button>
            <button
              onClick={() => setTab("whatsapp")}
              className={`flex-1 py-3 text-xs font-medium transition sm:text-sm ${tab === "whatsapp" ? "border-b-2 border-emerald-400 text-emerald-700" : "text-slate-500 hover:text-slate-600"}`}
            >
              וואטסאפ{waMsgs.length ? ` (${waMsgs.length})` : ""}
            </button>
            <button
              onClick={() => setTab("internal")}
              className={`flex-1 py-3 text-xs font-medium transition sm:text-sm ${tab === "internal" ? "border-b-2 border-amber-400 text-amber-800" : "text-slate-500 hover:text-slate-600"}`}
            >
              עדכונים{internalMsgs.length ? ` (${internalMsgs.length})` : ""}
            </button>
          </div>

          {tab === "client" ? (
            <>
              <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4">
                <div className="flex flex-col gap-2">
                  {clientThread.map((it) => {
                    if (it.fb) {
                      const ok = it.fb.decision === "approved";
                      return (
                        <div key={it.id} className={`self-center rounded-full border px-3 py-1 text-center text-[11px] ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-orange-200 bg-orange-50 text-orange-700"}`}>
                          {ok ? "✅ הלקוח אישר את העיצוב" : `✏️ הלקוח ביקש שינויים (סבב ${it.fb.round})`}
                          {it.fb.text ? <span className="text-slate-600"> — {it.fb.text}</span> : null}
                        </div>
                      );
                    }
                    const m = it.msg!;
                    const mine = m.authorSide === "agency";
                    return (
                      <div key={it.id} className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? "self-end border border-cyan-200 bg-cyan-50" : "self-start border border-slate-300 bg-slate-100"}`}>
                        <p className="mb-0.5 text-[10px] text-slate-400">
                          {m.authorName || (mine ? "המשרד" : "הלקוח")} · {formatDateTime(m.createdAt)}
                        </p>
                        <p className="whitespace-pre-line text-sm text-slate-800">{m.body}</p>
                      </div>
                    );
                  })}
                  {clientThread.length === 0 ? (
                    <p className="text-center text-xs text-slate-600">אין עדיין הודעות. פתחו שיחה עם הלקוח 👇</p>
                  ) : null}
                  <div ref={chatEndRef} />
                </div>
              </div>
              <div className="border-t border-slate-200 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                    rows={2}
                    placeholder="כתבו הודעה ללקוח… (Enter לשליחה)"
                    className="thin-scroll max-h-32 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                  />
                  <Button disabled={chatBusy || !chatText.trim()} onClick={sendChat}>שליחה</Button>
                </div>
                <p className="mt-1 text-[10px] text-slate-600">הלקוח רואה ומשיב מהקישור / פורטל האישורים שלו.</p>
              </div>
            </>
          ) : tab === "whatsapp" ? (
            <>
              {/* כותרת: תמונת פרופיל + מספר הלקוח */}
              <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2.5">
                {waAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={waAvatar} alt="avatar" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Icon name="whatsapp" className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700">{t.client?.name}</p>
                  <p dir="ltr" className="truncate text-right text-xs text-slate-500">{waPhone || "אין מספר"}</p>
                </div>
              </div>
              <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4">
                {!waConfigured ? (
                  <p className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">וואטסאפ אינו מחובר במערכת.</p>
                ) : !waPhone ? (
                  <p className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">אין מספר טלפון ללקוח — הוסיפו בכרטיס הלקוח כדי לשלוח וואטסאפ.</p>
                ) : null}
                <div className="flex flex-col gap-2">
                  {waMsgs.map((m) => {
                    const mine = m.direction === "out";
                    const href = m.mediaKey ? `/api/wa-media/${m.id}` : m.mediaUrl || null;
                    const isImg = (m.mediaMime || "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(m.mediaName || "");
                    return (
                      <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? "self-end border border-emerald-200 bg-emerald-50" : "self-start border border-slate-300 bg-slate-100"}`}>
                        <p className="mb-0.5 text-[10px] text-slate-400">{mine ? m.authorName || "המשרד" : "הלקוח (וואטסאפ)"} · {formatDateTime(m.createdAt)}</p>
                        {href && isImg ? (
                          <a href={href} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={href} alt={m.mediaName || "media"} className="mb-1 max-h-48 rounded-lg object-cover" />
                          </a>
                        ) : href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="mb-1 flex items-center gap-1.5 text-xs text-cyan-700 hover:text-cyan-700">
                            <Icon name="doc" className="h-4 w-4" /> {m.mediaName || "קובץ"}
                          </a>
                        ) : null}
                        <p className="whitespace-pre-line text-sm text-slate-800">{m.body}</p>
                      </div>
                    );
                  })}
                  {waMsgs.length === 0 ? (
                    <p className="text-center text-xs text-slate-600">אין עדיין הודעות וואטסאפ. שלחו הודעה 👇 — תשובות הלקוח יופיעו כאן.</p>
                  ) : null}
                  <div ref={chatEndRef} />
                </div>
              </div>
              <div className="border-t border-slate-200 p-3">
                <div className="flex items-end gap-2">
                  <input ref={waFileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadWaFile(e.target.files[0])} />
                  <button
                    type="button"
                    title="שליחת קובץ/מדיה"
                    disabled={waBusy || !waConfigured || !waPhone}
                    onClick={() => waFileRef.current?.click()}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-slate-600 transition hover:text-emerald-700 disabled:opacity-50"
                  >
                    <Icon name="upload" className="h-4 w-4" />
                  </button>
                  <textarea
                    value={waText}
                    onChange={(e) => setWaText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendWa(); } }}
                    rows={2}
                    placeholder="הודעת וואטסאפ ללקוח… (Enter לשליחה)"
                    disabled={!waConfigured || !waPhone}
                    className="thin-scroll max-h-32 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
                  />
                  <Button disabled={waBusy || !waText.trim() || !waConfigured || !waPhone} onClick={sendWa}>שליחה</Button>
                </div>
                <p className="mt-1 text-[10px] text-emerald-700">💬 שיחת וואטסאפ אמיתית — טקסט וגם קבצים/מדיה. תשובות הלקוח חוזרות לכאן.</p>
              </div>
            </>
          ) : (
            <>
              <div className="thin-scroll min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
                <div className="flex flex-col gap-3">
                  {internalMsgs.length === 0 ? (
                    <p className="mt-6 text-center text-xs text-slate-500">עדכונים פנימיים בין המעצב/ת למנהל התיק. הלקוח לא רואה זאת.</p>
                  ) : null}
                  {internalMsgs.map((m) => {
                    const shared = (m.sharedChannels || "").split(",").map((s) => s.trim()).filter(Boolean);
                    const sentEmail = shared.includes("email");
                    const sentWa = shared.includes("whatsapp");
                    const editing = editingMsgId === m.id;
                    const busyThis = blockBusy === m.id;
                    return (
                      <div key={m.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                        {/* ראש הכרטיס: אווטאר + שם + זמן + תפריט */}
                        <div className="flex items-start gap-2.5 px-4 pt-3">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                            style={{ background: avatarColor(m.authorName) }}
                          >
                            {initials(m.authorName)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-800">{m.authorName || "משרד"}</p>
                            <p className="text-[11px] text-slate-400">
                              {formatDateTime(m.createdAt)}
                              {m.editedAt ? " · נערך" : ""}
                            </p>
                          </div>
                          {!editing ? (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)}
                                className="rounded-lg px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                aria-label="פעולות"
                              >
                                ⋯
                              </button>
                              {openMenuId === m.id ? (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                                  <div className="absolute left-0 z-20 mt-1 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
                                    <button type="button" onClick={() => startEdit(m)} className="block w-full px-3 py-1.5 text-right text-slate-700 hover:bg-slate-50">✏️ עריכה</button>
                                    <button type="button" onClick={() => deleteBlock(m.id)} className="block w-full px-3 py-1.5 text-right text-red-600 hover:bg-red-50">🗑️ מחיקה</button>
                                  </div>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        {/* גוף */}
                        <div className="px-4 py-2.5">
                          {editing ? (
                            <>
                              <RichEditor
                                key={`edit-${m.id}`}
                                value={m.body}
                                onChange={setEditHtml}
                                uploadImage={uploadStudioMedia}
                                placeholder="עריכת עדכון…"
                                minHeight={80}
                              />
                              <div className="mt-2 flex items-center justify-end gap-2">
                                <button type="button" onClick={cancelEdit} className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100">ביטול</button>
                                <Button disabled={busyThis || isHtmlEmpty(editHtml)} onClick={() => saveEdit(m.id)}>שמירה</Button>
                              </div>
                            </>
                          ) : (
                            <div className="rich-content" dangerouslySetInnerHTML={{ __html: m.body }} />
                          )}
                        </div>
                        {/* שורת פעולות: מצב + שליחה ללקוח */}
                        {!editing ? (
                          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2">
                            {shared.length === 0 ? (
                              <span className="text-[11px] text-slate-400">🔒 פנימי</span>
                            ) : (
                              <span className="text-[11px] font-medium text-emerald-600">
                                {sentEmail ? "✉️ נשלח במייל" : ""}
                                {sentEmail && sentWa ? " · " : ""}
                                {sentWa ? "💬 נשלח בוואטסאפ" : ""}
                              </span>
                            )}
                            <div className="ms-auto flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busyThis || !t.clientHasEmail}
                                onClick={() => shareBlock(m.id, "email")}
                                title={t.clientHasEmail ? "שלח את התוכן ללקוח במייל" : "אין כתובת מייל ללקוח"}
                                className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {busyThis ? "…" : `${sentEmail ? "✓ " : ""}שלח במייל`}
                              </button>
                              <button
                                type="button"
                                disabled={busyThis || !t.clientPhone || !waConfigured}
                                onClick={() => shareBlock(m.id, "whatsapp")}
                                title={!t.clientPhone ? "אין טלפון ללקוח" : !waConfigured ? "וואטסאפ אינו מוגדר" : "שלח את התוכן ללקוח בוואטסאפ"}
                                className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {busyThis ? "…" : `${sentWa ? "✓ " : ""}שלח בוואטסאפ`}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
              </div>
              <div className="border-t border-slate-200 p-3">
                <RichEditor
                  value=""
                  onChange={setInternalHtml}
                  resetSignal={internalSignal}
                  uploadImage={uploadStudioMedia}
                  placeholder="כתבו עדכון — טקסט, תמונות, צילומי מסך, קישורים…"
                  minHeight={80}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] text-slate-500">🔒 העדכון נשמר פנימי — שליחה ללקוח דרך הכפתורים שבכל בלוק.</p>
                  <Button disabled={chatBusy || isHtmlEmpty(internalHtml)} onClick={sendInternal}>פרסום עדכון</Button>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
