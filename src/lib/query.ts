import { resolvePreset } from "./dates";
import type { DatePreset, DateRange } from "./types";

const VALID_PRESETS: DatePreset[] = [
  "yesterday",
  "last7",
  "currentMonth",
  "previousMonth",
  "lastYear",
  "custom",
];

export interface ParsedQuery {
  preset: DatePreset;
  range: DateRange;
  campaignId: string; // "all" or a campaign id
}

/**
 * Parse the standard dashboard query params used by every API route:
 *   ?preset=last7&campaign=<id>
 *   ?preset=custom&from=2026-01-01&to=2026-01-31&campaign=all
 */
export function parseQuery(searchParams: URLSearchParams): ParsedQuery {
  const presetParam = (searchParams.get("preset") ?? "last7") as DatePreset;
  const preset = VALID_PRESETS.includes(presetParam) ? presetParam : "last7";
  const campaignId = searchParams.get("campaign") || "all";

  let range: DateRange;
  if (preset === "custom") {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from && to) {
      // Normalise to start-of-day / end-of-day boundaries.
      const fromDate = new Date(from);
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      range = { from: fromDate.toISOString(), to: toDate.toISOString() };
    } else {
      range = resolvePreset("last7");
    }
  } else {
    range = resolvePreset(preset);
  }

  return { preset, range, campaignId };
}
