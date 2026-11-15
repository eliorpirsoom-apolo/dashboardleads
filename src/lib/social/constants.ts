// ---------------------------------------------------------------------------
// תיבת מענה חברתי — קבועים משותפים לשרת ול-UI (נתונים בלבד, בלי ייבוא שרת).
// מקור יחיד לסטטוסים/פלטפורמות/סוגים: ה-API מאמת מולו וה-UI מציג ממנו.
// ---------------------------------------------------------------------------

export const THREAD_STATUSES = ["open", "drafted", "answered", "needs_human", "lead", "ignored"] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export const PLATFORMS = ["facebook", "instagram"] as const;
export type SocialPlatform = (typeof PLATFORMS)[number];

export const THREAD_KINDS = ["comment", "dm"] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

export const STATUS_META: Record<ThreadStatus, { label: string; color: string }> = {
  open: { label: "פתוח", color: "#38bdf8" },
  drafted: { label: "טיוטה ממתינה", color: "#a78bfa" },
  answered: { label: "נענה", color: "#34d399" },
  needs_human: { label: "דורש אדם", color: "#f59e0b" },
  lead: { label: "ליד", color: "#f472b6" },
  ignored: { label: "התעלמות", color: "#94a3b8" },
};

export const PLATFORM_META: Record<SocialPlatform, { label: string; icon: string }> = {
  facebook: { label: "פייסבוק", icon: "📘" },
  instagram: { label: "אינסטגרם", icon: "📷" },
};

export const KIND_META: Record<ThreadKind, string> = {
  comment: "תגובה",
  dm: "הודעה פרטית",
};

// סיווג ה-AI לפנייה (שלב 1b) — תווית וצבע לצ׳יפ.
export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  question: { label: "שאלה", color: "#38bdf8" },
  lead: { label: "מתעניין", color: "#f472b6" },
  complaint: { label: "תלונה", color: "#f87171" },
  negotiation: { label: "משא ומתן", color: "#f59e0b" },
  legal: { label: "משפטי", color: "#ef4444" },
  spam: { label: "ספאם?", color: "#94a3b8" },
  thanks: { label: "תודה", color: "#34d399" },
  other: { label: "אחר", color: "#64748b" },
};
