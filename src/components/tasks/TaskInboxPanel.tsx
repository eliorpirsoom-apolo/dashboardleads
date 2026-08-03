"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Chip, EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface InboxItem {
  id: string;
  text: string;
  status: string;
  source: string;
  createdByName: string | null;
  convertedTaskId: string | null;
  createdAt: string;
}

const SOURCE_LABEL: Record<string, string> = { manual: "ידני", whatsapp: "וואטסאפ", ai: "AI" };
const SOURCE_COLOR: Record<string, string> = { manual: "#94a3b8", whatsapp: "#22c55e", ai: "#8b5cf6" };

// מאגר לכידה מהיר — זריקת משימות/תזכורות בשורה אחת, וסידור מאוחר.
export default function TaskInboxPanel({
  onConvert,
  reloadSignal = 0,
  onOpenCount,
}: {
  onConvert: (item: { id: string; text: string }) => void;
  reloadSignal?: number;
  onOpenCount?: (n: number) => void;
}) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [filter, setFilter] = useState<"inbox" | "handled" | "all">("inbox");
  const [quick, setQuick] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState("");
  const quickRef = useRef<HTMLTextAreaElement>(null);
  const onCountRef = useRef(onOpenCount);
  onCountRef.current = onOpenCount;

  const load = useCallback(async () => {
    try {
      const d = await api<{ items: InboxItem[]; openCount: number }>(`/api/task-inbox?status=${filter}`);
      setItems(d.items);
      onCountRef.current?.(d.openCount);
    } catch (e: any) {
      setError(e.message);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  async function add() {
    const text = quick.trim();
    if (!text) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/task-inbox", { method: "POST", json: { text } });
      setQuick("");
      await load();
      quickRef.current?.focus();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function patch(id: string, json: Record<string, unknown>) {
    setError("");
    try {
      await api(`/api/task-inbox/${id}`, { method: "PATCH", json });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function del(id: string) {
    if (!confirm("למחוק את הפריט מהמאגר?")) return;
    setError("");
    try {
      await api(`/api/task-inbox/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }
  function startEdit(it: InboxItem) {
    setEditingId(it.id);
    setEditText(it.text);
  }
  async function saveEdit(id: string) {
    const text = editText.trim();
    if (!text) return;
    await patch(id, { text });
    setEditingId(null);
    setEditText("");
  }

  const FILTERS: { key: "inbox" | "handled" | "all"; label: string }[] = [
    { key: "inbox", label: "במאגר" },
    { key: "handled", label: "טופלו" },
    { key: "all", label: "הכל" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* לכידה מהירה */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-2 text-sm font-bold text-slate-700">🗒️ זריקה מהירה למאגר</p>
        <div className="flex items-end gap-2">
          <textarea
            ref={quickRef}
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                add();
              }
            }}
            rows={1}
            placeholder="כתבו משימה או תזכורת ולחצו Enter… (Shift+Enter לשורה חדשה)"
            className="thin-scroll max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#3a5bd9] focus:outline-none"
          />
          <Button disabled={busy || !quick.trim()} onClick={add}>
            <Icon name="plus" className="h-4 w-4" />
            הוספה
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          כל מה שצץ במהלך היום — זרקו לכאן כדי לא לשכוח, ובסוף היום עשו סדר.
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {/* סינון */}
      <div className="flex items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === f.key ? "bg-[#3a5bd9] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* רשימה */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6">
          <EmptyState icon="tasks" title="המאגר ריק" hint="זרקו לכאן משימות ותזכורות שצצות במהלך היום." />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it) => {
            const done = it.status === "done";
            const converted = it.status === "converted";
            const editing = editingId === it.id;
            return (
              <div
                key={it.id}
                className={`flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm ${
                  done || converted ? "opacity-60" : ""
                }`}
              >
                <button
                  onClick={() => patch(it.id, { status: done ? "inbox" : "done" })}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                    done ? "border-emerald-500 bg-emerald-500/20 text-emerald-600" : "border-slate-300 text-transparent hover:border-[#3a5bd9]"
                  }`}
                  title={done ? "החזרה למאגר" : "סימון כבוצע"}
                >
                  <Icon name="check" className="h-3.5 w-3.5" />
                </button>

                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(it.id);
                          if (e.key === "Escape") { setEditingId(null); setEditText(""); }
                        }}
                        autoFocus
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-[#3a5bd9] focus:outline-none"
                      />
                      <Button size="sm" onClick={() => saveEdit(it.id)}>שמירה</Button>
                      <button onClick={() => { setEditingId(null); setEditText(""); }} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">ביטול</button>
                    </div>
                  ) : (
                    <p className={`whitespace-pre-wrap break-words text-sm text-slate-700 ${done ? "line-through" : ""}`}>{it.text}</p>
                  )}
                  {!editing ? (
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                      {it.createdByName ? <span>{it.createdByName}</span> : null}
                      <span>{formatDateTime(it.createdAt)}</span>
                      {converted ? <span className="text-[#3a5bd9]">· ➜ הפך למשימה</span> : null}
                    </p>
                  ) : null}
                </div>

                {it.source !== "manual" ? (
                  <Chip color={SOURCE_COLOR[it.source] || "#94a3b8"}>{SOURCE_LABEL[it.source] || it.source}</Chip>
                ) : null}

                {!editing ? (
                  <div className="flex items-center gap-1">
                    {it.status === "inbox" ? (
                      <button
                        onClick={() => onConvert({ id: it.id, text: it.text })}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-[#3a5bd9] transition hover:bg-slate-50"
                        title="הפוך למשימה מתוזמנת"
                      >
                        <Icon name="calendar" className="h-3.5 w-3.5" />
                        הפוך למשימה
                      </button>
                    ) : null}
                    <button onClick={() => startEdit(it)} className="rounded p-1.5 text-slate-500 hover:text-[#3a5bd9]" title="עריכה">
                      <Icon name="edit" className="h-4 w-4" />
                    </button>
                    <button onClick={() => del(it.id)} className="rounded p-1.5 text-slate-500 hover:text-red-600" title="מחיקה">
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
