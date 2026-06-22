"use client";

export interface ClientOption {
  id: string;
  name: string;
  gscProperty: string | null;
  ga4PropertyId: string | null;
}

export default function ClientSelector({
  clients,
  value,
  onChange,
}: {
  clients: ClientOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="whitespace-nowrap text-sm font-medium text-slate-400">
        לקוח
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[220px] rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-sm font-medium text-slate-100 shadow-sm outline-none transition-colors focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40"
      >
        {clients.length === 0 && <option value="">אין לקוחות</option>}
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
