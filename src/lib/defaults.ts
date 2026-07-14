import type { Prisma, PrismaClient } from "@prisma/client";

// Default lead statuses created for every new client (they can edit freely).
export const DEFAULT_STATUSES = [
  { name: "חדש", color: "#38bdf8", order: 0, systemKind: "new", isDefault: true },
  { name: "בטיפול", color: "#f59e0b", order: 1, systemKind: "in_progress", isDefault: false },
  { name: "נקבעה פגישה", color: "#a78bfa", order: 2, systemKind: "in_progress", isDefault: false },
  { name: "עסקה", color: "#34d399", order: 3, systemKind: "won", isDefault: false },
  { name: "אבוד", color: "#f87171", order: 4, systemKind: "lost", isDefault: false },
] as const;

type Db = PrismaClient | Prisma.TransactionClient;

export async function createDefaultStatuses(db: Db, clientId: string) {
  for (const s of DEFAULT_STATUSES) {
    await db.leadStatus.create({ data: { ...s, clientId } });
  }
}

export const SYSTEM_KINDS = [
  { value: "new", label: "חדש" },
  { value: "in_progress", label: "בטיפול" },
  { value: "won", label: "עסקה (מוריד מהמלאי בנדל\"ן)" },
  { value: "lost", label: "אבוד" },
] as const;

export const DOCUMENT_CATEGORIES = [
  { value: "agreement", label: "הסכם עבודה / הצעת מחיר" },
  { value: "invoice", label: "חשבוניות ומסמכים" },
  { value: "receipt_facebook", label: "קבלות פייסבוק" },
  { value: "receipt_google", label: "קבלות גוגל" },
  { value: "floor_plan", label: "תוכניות דירה" },
  { value: "contract", label: "חוזים" },
  { value: "logo", label: "לוגו" },
  { value: "other", label: "אחר" },
] as const;

export function documentCategoryLabel(value: string): string {
  return DOCUMENT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export const CHANNELS = [
  { value: "facebook", label: "פייסבוק" },
  { value: "google", label: "גוגל" },
  { value: "landing", label: "דף נחיתה" },
  { value: "organic", label: "אורגני" },
  { value: "phone", label: "טלפון" },
  { value: "whatsapp", label: "וואטסאפ" },
  { value: "referral", label: "הפניה" },
  { value: "other", label: "אחר" },
] as const;

export function channelLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return CHANNELS.find((c) => c.value === value)?.label ?? value;
}
