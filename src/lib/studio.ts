// קבועים למודול הסטודיו — סטטוסים, סוגי עבודה, ותוויות עברית.

export const DESIGN_STATUSES = [
  "scheduled",
  "in_progress",
  "sent_to_client",
  "client_feedback",
  "final_review",
  "qc",
  "ready_to_publish",
  "approved",
] as const;
export type DesignStatus = (typeof DESIGN_STATUSES)[number];

export const DESIGN_STATUS_LABELS: Record<string, string> = {
  scheduled: "מתוזמנת",
  in_progress: "בעבודה",
  sent_to_client: "נשלח ללקוח לאישור",
  client_feedback: "חזר מאישור (פידבק)",
  final_review: "נשלח לאישור סופי",
  qc: "בקרת איכות",
  ready_to_publish: "מאושר לעלות לאוויר",
  approved: "אושר / הושלם",
};

export const DESIGN_STATUS_COLORS: Record<string, string> = {
  scheduled: "#64748b",
  in_progress: "#22d3ee",
  sent_to_client: "#f59e0b",
  client_feedback: "#f97316",
  final_review: "#a78bfa",
  qc: "#eab308",
  ready_to_publish: "#ec4899",
  approved: "#34d399",
};

export const BRIEF_TYPES = [
  { value: "landing", label: "דף נחיתה" },
  { value: "logo", label: "לוגו" },
  { value: "post", label: "פוסט" },
  { value: "banner", label: "באנר" },
  { value: "print", label: "דפוס" },
  { value: "branding", label: "מיתוג" },
] as const;

export function briefTypeLabel(v: string): string {
  return BRIEF_TYPES.find((t) => t.value === v)?.label ?? v;
}

export const DESIGN_PRIORITIES = [
  { value: "low", label: "קל" },
  { value: "normal", label: "בינוני" },
  { value: "high", label: "חשוב מאוד" },
] as const;

export const DESIGN_PRIORITY_COLORS: Record<string, string> = {
  low: "#64748b",
  normal: "#38bdf8",
  high: "#f87171",
};

export function priorityLabel(v: string): string {
  return DESIGN_PRIORITIES.find((p) => p.value === v)?.label ?? v;
}
