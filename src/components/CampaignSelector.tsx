"use client";

import { formatNumber } from "@/lib/format";

export interface CampaignOption {
  id: string;
  name: string;
  leadCount: number;
}

export default function CampaignSelector({
  campaigns,
  value,
  onChange,
}: {
  campaigns: CampaignOption[];
  value: string; // "all" or campaign id
  onChange: (id: string) => void;
}) {
  const totalLeads = campaigns.reduce((sum, c) => sum + c.leadCount, 0);

  return (
    <div className="flex items-center gap-2">
      <label className="whitespace-nowrap text-sm font-medium text-slate-400">
        קמפיין
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[210px] rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-sm font-medium text-slate-100 shadow-sm outline-none transition-colors focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40"
      >
        <option value="all">כל הקמפיינים ({formatNumber(totalLeads)})</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({formatNumber(c.leadCount)})
          </option>
        ))}
      </select>
    </div>
  );
}
