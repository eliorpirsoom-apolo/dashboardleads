"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// פעמון התראות (ליד שם המשתמש בסיידבר) — מונה תיוגים שלא נקראו, לחיצה → עמוד ההתראות.
export default function NotificationsBell() {
  const [unread, setUnread] = useState(0);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications?count=1", { credentials: "include" });
      if (!r.ok) return;
      const j = await r.json();
      setUnread(Number(j.unread) || 0);
    } catch {
      /* שקט — ננסה שוב בסבב הבא */
    }
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 60000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(iv);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return (
    <button
      onClick={() => router.push("/admin/notifications")}
      title={unread ? `${unread} התראות חדשות` : "התראות"}
      className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-[#3a5bd9]"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 ? (
        <span className="absolute -left-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </button>
  );
}
