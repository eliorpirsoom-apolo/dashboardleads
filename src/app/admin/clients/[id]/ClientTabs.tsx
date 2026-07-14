"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ClientTabs({
  tabs,
}: {
  tabs: { href: string; label: string; exact?: boolean }[];
}) {
  const pathname = usePathname();
  return (
    <nav className="thin-scroll flex gap-1 overflow-x-auto border-b border-slate-800/70 pb-px">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`whitespace-nowrap rounded-t-xl px-4 py-2 text-sm font-medium transition ${
              active
                ? "border-b-2 border-cyan-400 bg-slate-800/40 text-cyan-300"
                : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
