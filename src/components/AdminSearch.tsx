"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/fetcher";
import { Icon } from "./Icon";

interface Results {
  clients: { id: string; name: string; type: string; active: boolean }[];
  leads: {
    id: string;
    number: number;
    fullName: string | null;
    phone: string | null;
    client: { id: string; name: string };
  }[];
}

// חיפוש גלובלי למשרד: לקוח או ליד לפי שם/טלפון/אימייל — מכל מקום.
export default function AdminSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      api<Results>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((d) => {
          setResults(d);
          setOpen(true);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  const empty =
    results && results.clients.length === 0 && results.leads.length === 0;

  return (
    <div ref={boxRef} className="relative px-3 pb-2">
      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2">
        <Icon name="search" className="h-4 w-4 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results && setOpen(true)}
          placeholder="חיפוש לקוח / ליד…"
          className="w-full bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
        />
      </div>

      {open && results ? (
        <div className="absolute inset-x-3 top-full z-50 mt-1 max-h-80 overflow-y-auto thin-scroll rounded-xl border border-slate-300 bg-[#0a0f1d] p-2 shadow-2xl">
          {empty ? (
            <p className="px-2 py-3 text-center text-xs text-slate-500">אין תוצאות</p>
          ) : (
            <>
              {results.clients.length > 0 ? (
                <>
                  <p className="px-2 pt-1 text-[10px] font-bold text-slate-500">לקוחות</p>
                  {results.clients.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => go(`/admin/clients/${c.id}`)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-right text-sm text-slate-700 hover:bg-slate-100"
                    >
                      <Icon name="users" className="h-3.5 w-3.5 text-slate-500" />
                      {c.name}
                      {!c.active ? <span className="text-[10px] text-red-600">מושבת</span> : null}
                    </button>
                  ))}
                </>
              ) : null}
              {results.leads.length > 0 ? (
                <>
                  <p className="px-2 pt-2 text-[10px] font-bold text-slate-500">לידים</p>
                  {results.leads.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => go(`/admin/clients/${l.client.id}/leads`)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-right text-sm text-slate-700 hover:bg-slate-100"
                    >
                      <Icon name="leads" className="h-3.5 w-3.5 text-slate-500" />
                      <span className="truncate">
                        #{l.number} {l.fullName ?? l.phone ?? ""}
                      </span>
                      <span className="mr-auto truncate text-[10px] text-slate-500">{l.client.name}</span>
                    </button>
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
