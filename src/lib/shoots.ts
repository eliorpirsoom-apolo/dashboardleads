// קבועים משותפים למודול ימי צילום (API + UI). אין תלות שרת — בטוח לייבוא בלקוח.

export const SHOOT_STATUSES = [
  { key: "pending", label: "בתיאום", color: "#94a3b8" },
  { key: "scheduled", label: "נקבע", color: "#3a5bd9" },
  { key: "approved", label: "אושר", color: "#8b5cf6" },
  { key: "shot", label: "צולם", color: "#0ea5e9" },
  { key: "editing", label: "בעריכה", color: "#f59e0b" },
  { key: "delivered", label: "נמסר", color: "#10b981" },
] as const;

export const SHOOT_STATUS_KEYS = SHOOT_STATUSES.map((s) => s.key);

export function shootStatusMeta(key: string) {
  return SHOOT_STATUSES.find((s) => s.key === key) ?? SHOOT_STATUSES[0];
}

export const SHOOT_TYPES = [
  { key: "stills", label: "סטילס" },
  { key: "video", label: "וידאו" },
  { key: "drone", label: "רחפן" },
] as const;

export const SHOOT_TYPE_KEYS = SHOOT_TYPES.map((t) => t.key);

export function shootTypeLabel(key: string): string {
  return SHOOT_TYPES.find((t) => t.key === key)?.label ?? key;
}
