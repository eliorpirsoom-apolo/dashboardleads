import {
  startOfDay,
  endOfDay,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  endOfYear,
  subYears,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
} from "date-fns";
import type {
  ComparisonRange,
  DatePreset,
  DateRange,
  MetricComparison,
} from "./types";

// ---------------------------------------------------------------------------
// Preset resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a named preset into a concrete [from, to] range (both inclusive,
 * normalised to start/end of day). `now` is injectable for testing.
 */
export function resolvePreset(preset: DatePreset, now = new Date()): DateRange {
  switch (preset) {
    case "yesterday": {
      const y = subDays(now, 1);
      return toRange(startOfDay(y), endOfDay(y));
    }
    case "last7":
      // Last 7 days including today.
      return toRange(startOfDay(subDays(now, 6)), endOfDay(now));
    case "currentMonth":
      return toRange(startOfMonth(now), endOfDay(now));
    case "previousMonth": {
      const prev = subMonths(now, 1);
      return toRange(startOfMonth(prev), endOfMonth(prev));
    }
    case "lastYear": {
      const prev = subYears(now, 1);
      return toRange(startOfYear(prev), endOfYear(prev));
    }
    case "custom":
    default:
      // Fallback: last 7 days.
      return toRange(startOfDay(subDays(now, 6)), endOfDay(now));
  }
}

function toRange(from: Date, to: Date): DateRange {
  return { from: from.toISOString(), to: to.toISOString() };
}

// ---------------------------------------------------------------------------
// Period-over-period comparison
// ---------------------------------------------------------------------------

/**
 * Given any date range, compute the immediately-preceding range of equal
 * length. e.g. "Last 7 days" -> the 7 days before that.
 *
 * For full-calendar presets we align to the natural previous period so the
 * comparison feels intuitive (previous month vs the month before it, etc.).
 */
export function comparisonRange(
  range: DateRange,
  preset?: DatePreset
): ComparisonRange {
  const from = new Date(range.from);
  const to = new Date(range.to);

  if (preset === "currentMonth") {
    const prev = subMonths(from, 1);
    return {
      current: range,
      previous: toRange(startOfMonth(prev), endOfMonth(prev)),
    };
  }
  if (preset === "previousMonth") {
    const prev = subMonths(from, 1);
    return {
      current: range,
      previous: toRange(startOfMonth(prev), endOfMonth(prev)),
    };
  }
  if (preset === "lastYear") {
    const prev = subYears(from, 1);
    return {
      current: range,
      previous: toRange(startOfYear(prev), endOfYear(prev)),
    };
  }

  // Generic case (last7, yesterday, custom): shift back by the range length.
  const lengthDays = differenceInCalendarDays(to, from) + 1;
  const prevTo = endOfDay(subDays(from, 1));
  const prevFrom = startOfDay(subDays(from, lengthDays));
  return { current: range, previous: toRange(prevFrom, prevTo) };
}

// ---------------------------------------------------------------------------
// Metric helpers
// ---------------------------------------------------------------------------

/** Build a MetricComparison from a current and previous value. */
export function buildComparison(
  value: number,
  previousValue: number
): MetricComparison {
  const delta = value - previousValue;
  const deltaPercent =
    previousValue === 0 ? null : (delta / previousValue) * 100;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return { value, previousValue, delta, deltaPercent, direction };
}

/** Inclusive list of ISO day-keys (yyyy-MM-dd) spanning the range. */
export function daysInRange(range: DateRange): string[] {
  const days = eachDayOfInterval({
    start: startOfDay(new Date(range.from)),
    end: startOfDay(new Date(range.to)),
  });
  return days.map((d) => format(d, "yyyy-MM-dd"));
}

export function rangeLengthDays(range: DateRange): number {
  return (
    differenceInCalendarDays(new Date(range.to), new Date(range.from)) + 1
  );
}

export const PRESET_LABELS: Record<DatePreset, string> = {
  yesterday: "Yesterday",
  last7: "Last 7 Days",
  currentMonth: "Current Month",
  previousMonth: "Previous Month",
  lastYear: "Last Year",
  custom: "Custom Range",
};
