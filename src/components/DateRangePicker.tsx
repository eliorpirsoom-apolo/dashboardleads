"use client";

import { resolvePreset, PRESET_LABELS } from "@/lib/dates";
import type { DatePreset } from "@/lib/types";
import { format } from "date-fns";

export interface RangeSelection {
  preset: DatePreset;
  from: string; // yyyy-MM-dd (used only for custom)
  to: string; // yyyy-MM-dd (used only for custom)
}

const PRESETS: DatePreset[] = [
  "yesterday",
  "last7",
  "currentMonth",
  "previousMonth",
  "lastYear",
];

export default function DateRangePicker({
  value,
  onChange,
}: {
  value: RangeSelection;
  onChange: (v: RangeSelection) => void;
}) {
  // Seed the custom inputs from the active preset for a smooth transition.
  function selectPreset(preset: DatePreset) {
    if (preset === "custom") {
      const r = resolvePreset(value.preset === "custom" ? "last7" : value.preset);
      onChange({
        preset: "custom",
        from: format(new Date(r.from), "yyyy-MM-dd"),
        to: format(new Date(r.to), "yyyy-MM-dd"),
      });
    } else {
      onChange({ ...value, preset });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => selectPreset(p)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              value.preset === p
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
        <button
          onClick={() => selectPreset("custom")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value.preset === "custom"
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          {PRESET_LABELS.custom}
        </button>
      </div>

      {value.preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-2 ring-1 ring-slate-200">
          <label className="text-xs font-medium text-slate-500">From</label>
          <input
            type="date"
            value={value.from}
            max={value.to}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="rounded-md border border-slate-200 px-2 py-1 text-sm"
          />
          <label className="text-xs font-medium text-slate-500">To</label>
          <input
            type="date"
            value={value.to}
            min={value.from}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="rounded-md border border-slate-200 px-2 py-1 text-sm"
          />
        </div>
      )}
    </div>
  );
}
