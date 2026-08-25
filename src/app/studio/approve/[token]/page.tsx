"use client";

import { useCallback, useEffect, useState } from "react";

interface Asset { id: string; fileName: string | null; mimeType: string | null; round: number }
interface Msg { id: string; assetId: string | null; authorSide: string; authorName: string | null; body: string; createdAt: string }
interface Fb { id: string; decision: string; text: string | null; round: number; createdAt: string }
interface Task {
  title: string;
  briefType: string;
  status: string;
  round: number;
  clientName: string | null;
  assets: Asset[];
  messages: Msg[];
  feedback: Fb[];
}

const BRIEF_LABELS: Record<string, string> = {
  landing: "דף נחיתה", logo: "לוגו", post: "פוסט", banner: "באנר", print: "דפוס", branding: "מיתוג",
};

function isImage(a: Asset): boolean {
  if (a.mimeType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(a.fileName || "");
}
function fmt(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ApprovePage({ params }: { params: { token: string } }) {
  const token = params.token;
  const [task, setTask] = useState<Task | null>(null);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState("");
  const [assetComment, setAssetComment] = useState<Record<string, string>>({});
  const [openAsset, setOpenAsset] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/studio/approve/${token}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "שגיאה");
      setTask(j.task);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(decision: "approved" | "changes") {
    if (decision === "changes" && !note.trim()) {
      alert("נא לפרט מה לתקן");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/studio/approve/${token}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, text: note || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "שגיאה");
      setNote("");
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendMsg(body: string, assetId: string | null) {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/studio/approve/${token}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, assetId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "שגיאה");
      if (assetId) setAssetComment((p) => ({ ...p, [assetId]: "" }));
      else setChat("");
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f6f7fb] text-slate-400">טוען…</div>;
  }
  if (err || !task) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7fb] px-6 text-center text-slate-600">
        <div>
          <h1 className="mb-2 text-2xl font-black tracking-tight text-slate-800">APOLLO<span className="text-cyan-400">ADV</span></h1>
          <p className="text-sm text-slate-400">{err || "הקישור אינו תקין"}</p>
        </div>
      </div>
    );
  }

  const waiting = task.status === "sent_to_client";
  const approved =
    task.status === "final_review" || task.status === "approved" ||
    task.status === "qc" || task.status === "ready_to_publish";
  const generalMsgs = task.messages.filter((m) => !m.assetId);
  const assetMsgs = (id: string) => task.messages.filter((m) => m.assetId === id);

  return (
    <div className="min-h-screen bg-[#f6f7fb] px-4 py-8 text-slate-700">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-black tracking-tight text-slate-800">APOLLO<span className="text-cyan-400">ADV</span></h1>
          <p className="mt-1 text-sm text-slate-500">אישור עיצוב{task.clientName ? ` · ${task.clientName}` : ""}</p>
        </header>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-800">{task.title}</h2>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">{BRIEF_LABELS[task.briefType] || task.briefType}</span>
            {task.round > 1 ? <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs text-orange-700">סבב {task.round}</span> : null}
          </div>
          {approved ? (
            <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              קיבלנו את תגובתך — תודה! נמשיך מכאן. אפשר להמשיך להתכתב איתנו למטה בכל שאלה.
            </p>
          ) : waiting ? (
            <p className="mt-1 text-sm text-slate-400">הקבצים למטה ממתינים לאישורך. אפשר להעיר על כל קובץ בנפרד, ואז לאשר או לבקש שינויים.</p>
          ) : (
            <p className="mt-1 text-sm text-slate-400">העיצוב בעבודה. נעדכן אותך כשתהיה גרסה חדשה לאישור.</p>
          )}
        </div>

        {/* Deliverables */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {task.assets.map((a) => {
            const comments = assetMsgs(a.id);
            const open = openAsset === a.id;
            return (
              <div key={a.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <a href={`/api/studio/approve/${token}/asset/${a.id}`} target="_blank" rel="noopener noreferrer" className="block">
                  {isImage(a) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/studio/approve/${token}/asset/${a.id}`} alt={a.fileName || "asset"} className="h-48 w-full bg-slate-100 object-cover" />
                  ) : (
                    <div className="flex h-48 w-full items-center justify-center text-slate-500">📄 קובץ להורדה</div>
                  )}
                </a>
                <div className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="truncate text-slate-600">{a.fileName}</span>
                  <button onClick={() => setOpenAsset(open ? null : a.id)} className="shrink-0 text-cyan-700 hover:text-cyan-700">
                    💬 הערה{comments.length ? ` (${comments.length})` : ""}
                  </button>
                </div>
                {open ? (
                  <div className="border-t border-slate-200 p-3">
                    <div className="mb-2 flex flex-col gap-1.5">
                      {comments.map((m) => (
                        <div key={m.id} className={`rounded-xl px-2.5 py-1.5 text-xs ${m.authorSide === "client" ? "bg-cyan-50 text-slate-800" : "bg-slate-100 text-slate-700"}`}>
                          <span className="text-[10px] text-slate-400">{m.authorName || (m.authorSide === "client" ? "אתם" : "הסטודיו")} · {fmt(m.createdAt)}</span>
                          <p className="whitespace-pre-line">{m.body}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-end gap-2">
                      <input
                        value={assetComment[a.id] ?? ""}
                        onChange={(e) => setAssetComment((p) => ({ ...p, [a.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") sendMsg(assetComment[a.id] ?? "", a.id); }}
                        placeholder="הערה על הקובץ הזה…"
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                      />
                      <button disabled={busy} onClick={() => sendMsg(assetComment[a.id] ?? "", a.id)} className="rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs text-cyan-700 hover:bg-cyan-500/30 disabled:opacity-50">שליחה</button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {task.assets.length === 0 ? <p className="text-sm text-slate-600">אין קבצים להצגה עדיין.</p> : null}
        </div>

        {/* Approve / request changes */}
        {waiting ? (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="הערות כלליות / בקשת תיקונים (חובה אם מבקשים שינויים)…"
              className="mb-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            />
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => decide("approved")} className="flex-1 rounded-xl bg-gradient-to-l from-emerald-500 to-cyan-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                מאשר/ת את העיצוב ✓
              </button>
              <button disabled={busy} onClick={() => decide("changes")} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                בקשת שינויים
              </button>
            </div>
          </div>
        ) : null}

        {/* General chat */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 text-sm font-bold text-slate-600">התכתבות עם הסטודיו</p>
          <div className="mb-3 flex max-h-72 flex-col gap-2 overflow-y-auto">
            {generalMsgs.map((m) => {
              const mine = m.authorSide === "client";
              return (
                <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? "self-end bg-cyan-50" : "self-start bg-slate-100"}`}>
                  <p className="mb-0.5 text-[10px] text-slate-400">{m.authorName || (mine ? "אתם" : "הסטודיו")} · {fmt(m.createdAt)}</p>
                  <p className="whitespace-pre-line text-sm text-slate-800">{m.body}</p>
                </div>
              );
            })}
            {generalMsgs.length === 0 ? <p className="text-xs text-slate-600">כאן אפשר לכתוב לסטודיו ולקבל תשובות.</p> : null}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(chat, null); } }}
              rows={2}
              placeholder="כתבו הודעה לסטודיו… (Enter לשליחה)"
              className="max-h-32 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            />
            <button disabled={busy || !chat.trim()} onClick={() => sendMsg(chat, null)} className="rounded-xl bg-cyan-500/20 px-4 py-2.5 text-sm text-cyan-700 hover:bg-cyan-500/30 disabled:opacity-50">שליחה</button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">אפולו פרסום · הקישור אישי — נא לא לשתף</p>
      </div>
    </div>
  );
}
