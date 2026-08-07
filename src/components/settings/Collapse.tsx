"use client";

import { useEffect, useState } from "react";

// מיזעור מסגרות בהגדרות — המצב נשמר בדפדפן (localStorage) פר מסגרת.
export function useCollapse(id: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem(`settings-collapse-${id}`) === "1");
  }, [id]);
  const toggle = () =>
    setCollapsed((c) => {
      localStorage.setItem(`settings-collapse-${id}`, c ? "0" : "1");
      return !c;
    });
  return [collapsed, toggle];
}

export function CollapseBtn({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      title={collapsed ? "פתיחה" : "מיזעור"}
    >
      <span className={`text-xs transition-transform ${collapsed ? "" : "rotate-180"}`}>▲</span>
    </button>
  );
}
