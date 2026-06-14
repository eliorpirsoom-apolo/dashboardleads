// Client-safe formatting helpers (no server/Prisma imports).
import type { MetricComparison } from "./types";

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatPercent(n: number | null, digits = 1): string {
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

// Deltas where "up" is good (leads, conversions). Returns Tremor color tokens.
export function deltaColor(c: MetricComparison): "emerald" | "red" | "gray" {
  if (c.direction === "up") return "emerald";
  if (c.direction === "down") return "red";
  return "gray";
}

export function deltaLabel(c: MetricComparison): string {
  return `${formatPercent(c.deltaPercent)} vs previous period`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Map a lead status to a Tremor badge color.
export function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (/(convert|won|sold|deal|נמכר|עסקה)/.test(s)) return "emerald";
  if (/(qualified)/.test(s)) return "blue";
  if (/(contact)/.test(s)) return "amber";
  if (/(lost|no answer|נסגר)/.test(s)) return "red";
  if (/(new)/.test(s)) return "indigo";
  return "gray";
}
