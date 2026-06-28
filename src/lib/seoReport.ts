import { resolvePreset, comparisonRange, PRESET_LABELS } from "./dates";
import { fetchSeoReport } from "./searchConsole";
import type { DatePreset, DateRange, SeoReportData } from "./types";

// ---------------------------------------------------------------------------
// Report orchestration — resolves the reporting period (preset or custom
// range), derives the period-over-period comparison, and pulls the data from
// Search Console (or mock). The default preset is the previous full month,
// which is the natural cadence for a monthly client report.
// ---------------------------------------------------------------------------

export interface BuildReportOptions {
  preset?: DatePreset;
  range?: DateRange; // overrides preset when provided (custom range)
  clientName?: string;
  now?: Date;
}

export async function buildSeoReportData(
  opts: BuildReportOptions = {}
): Promise<SeoReportData> {
  const now = opts.now ?? new Date();
  const preset: DatePreset = opts.preset ?? "previousMonth";
  const range = opts.range ?? resolvePreset(preset, now);
  const { previous } = comparisonRange(range, preset);

  const clientName =
    opts.clientName ?? process.env.SEO_CLIENT_NAME ?? "הלקוח שלי";

  return fetchSeoReport({
    range,
    previousRange: previous,
    presetLabel: PRESET_LABELS[preset],
    clientName,
    generatedAt: now.toISOString(),
  });
}
