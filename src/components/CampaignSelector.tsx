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
      <label className="whitespace-nowrap text-sm font-medium text-slate-500">
        Campaign
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[200px] rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="all">All Campaigns ({formatNumber(totalLeads)})</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({formatNumber(c.leadCount)})
          </option>
        ))}
      </select>
    </div>
  );
}
