"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface Item {
  id: string;
  authorName: string;
  category: string;
  text: string;
  resolved: boolean;
  createdAt: string;
}

const CAT: Record<string, { label: string; color: string }> = {
  improvement: { label: "שיפור", color: "#3a5bd9" },
  bug: { label: "תקלה", color: "#ef4444" },
  idea: { label: "רעיון", color: "#f59e0b" },
  other: { label: "אחר", color: "#64748b" },
};

export default function FeedbackInbox() {
  const [items, setItems] = useState<Item[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === "open" ? "?resolved=0" : "";
      const d = await api<{ items: Item[]; openCount: number }>(`/api/feedback${q}`);
      setItems(d.items);
      setOpenCount(d.openCount);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  async function toggle(it: Item) {
    await api(`/api/feedback/${it.id}`, { method: "PATCH", json: { resolved: !it.resolved } });
    load();
  }
  async function remove(it: Item) {
    if (!confirm("למחוק את המשוב לצמיתות?")) return;
    await api(`/api/feedback/${it.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <button
            onClick={() => setFilter("open")}
            className={`rounded-lg px-3 py-1 text-sm font-medium ${filter === "open" ? "bg-[#3a5bd9] text-white" : "text-slate-600"}`}
          >
            פתוחים{openCount ? ` (${openCount})` : ""}
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-1 text-sm font-medium ${filter === "all" ? "bg-[#3a5bd9] text-white" : "text-slate-600"}`}
          >
            הכל
          </button>
        </div>
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">טוען…</p>
      ) : items.length === 0 ? (
        <Card><p className="py-6 text-center text-sm text-slate-500">{filter === "open" ? "אין משובים פתוחים 🎉" : "אין משובים עדיין."}</p></Card>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it) => {
            const c = CAT[it.category] ?? CAT.other;
            return (
              <Card key={it.id} className={it.resolved ? "opacity-60" : ""}>
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ color: c.color, backgroundColor: `${c.color}1a` }}
                  >
                    {c.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{it.text}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {it.authorName} · {formatDateTime(it.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => toggle(it)}
                      className={`rounded-lg px-2 py-1 text-xs font-medium ${it.resolved ? "text-slate-500 hover:bg-slate-100" : "text-emerald-600 hover:bg-emerald-50"}`}
                      title={it.resolved ? "החזרה לפתוח" : "סימון כטופל"}
                    >
                      <Icon name="check" className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(it)} className="rounded-lg p-1 text-slate-400 hover:text-red-600" title="מחיקה">
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
