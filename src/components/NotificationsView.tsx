"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/fetcher";
import { Button, Card } from "@/components/ui";

interface Notif {
  id: string;
  kind: string;
  text: string;
  link: string | null;
  actorName: string | null;
  readAt: string | null;
  createdAt: string;
}

// רשימת ההתראות: חדשות מודגשות, לחיצה מנווטת ליעד ומסמנת כנקראה.
export default function NotificationsView() {
  const [items, setItems] = useState<Notif[] | null>(null);
  const [unread, setUnread] = useState(0);
  const router = useRouter();

  const load = useCallback(async () => {
    const d = await api<{ items: Notif[]; unread: number }>("/api/notifications");
    setItems(d.items);
    setUnread(d.unread);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function markAll() {
    await api("/api/notifications", { method: "POST", json: { all: true } }).catch(() => {});
    load();
  }

  async function open(n: Notif) {
    if (!n.readAt) {
      api("/api/notifications", { method: "POST", json: { ids: [n.id] } }).catch(() => {});
    }
    if (n.link) router.push(n.link);
    else load();
  }

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  if (!items) return <Card><p className="p-6 text-center text-sm text-slate-500">טוען…</p></Card>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {unread > 0 ? <><b className="text-[#3a5bd9]">{unread}</b> התראות שלא נקראו</> : "אין התראות חדשות"}
        </p>
        {unread > 0 ? (
          <Button size="sm" variant="ghost" onClick={markAll}>סמן הכל כנקרא</Button>
        ) : null}
      </div>
      <Card className="!p-0 overflow-hidden">
        {items.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            אין התראות עדיין. כשמישהו יתייג אותך בעדכון (@) — זה יופיע כאן.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => open(n)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-right transition hover:bg-slate-50 ${n.readAt ? "" : "bg-[#3a5bd9]/[0.04]"}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-[#3a5bd9]"}`} />
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3a5bd9]/10 text-sm font-bold text-[#3a5bd9]">
                    {(n.actorName || "🔔").slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm leading-snug ${n.readAt ? "text-slate-600" : "font-medium text-slate-800"}`}>
                      {n.text}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-400" dir="ltr">{fmt(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
