"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./Icon";
import AdminSearch from "./AdminSearch";
import type { NavItem } from "@/lib/nav";

interface SidebarProps {
  items: NavItem[];
  userName: string;
  roleLabel: string; // "משרד" / client name
  homeHref: string;
  logoUrl?: string | null; // client company logo (spec: לוגו חברה)
}

export default function Sidebar({
  items,
  userName,
  roleLabel,
  homeHref,
  logoUrl,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto thin-scroll px-3">
      {items.map((item) => {
        const active =
          item.href === homeHref
            ? pathname === item.href
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              active
                ? "bg-cyan-500/15 font-semibold text-cyan-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
            }`}
          >
            <Icon name={item.icon} className="h-[18px] w-[18px]" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const userBlock = (
    <div className="border-t border-slate-800/80 p-3">
      <div className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-200">
            {userName}
          </p>
          <p className="truncate text-xs text-slate-500">{roleLabel}</p>
        </div>
        <button
          onClick={logout}
          title="יציאה"
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-red-400"
        >
          <Icon name="logout" className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-5 py-5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="h-9 w-9 rounded-xl border border-slate-700 bg-white/5 object-contain p-0.5"
        />
      ) : null}
      <div>
        {/* לוגו המשרד — שחור על שקוף, מהופך ללבן על הרקע הכהה. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/apollo-logo.png"
          alt="Apollo"
          className="h-5 w-auto invert"
        />
        <p className="mt-1 text-[11px] leading-tight text-slate-500">{roleLabel}</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800/70 bg-[#060912]/90 px-4 py-3 backdrop-blur md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-1.5 text-slate-300"
          aria-label="פתח תפריט"
        >
          <Icon name="menu" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/apollo-logo.png" alt="Apollo" className="h-4 w-auto invert" />
        <div className="w-8" />
      </div>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 flex w-64 flex-col bg-[#0a0f1d] shadow-2xl">
            <div className="flex items-center justify-between pl-3">
              {brand}
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400"
                aria-label="סגור תפריט"
              >
                <Icon name="x" />
              </button>
            </div>
            {nav}
            {userBlock}
          </aside>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-col border-l border-slate-800/70 bg-slate-950/40 backdrop-blur-xl md:flex">
        {brand}
        {homeHref === "/admin" ? <AdminSearch /> : null}
        {nav}
        {userBlock}
      </aside>
    </>
  );
}
