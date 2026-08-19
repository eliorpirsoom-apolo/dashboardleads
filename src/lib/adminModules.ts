import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "./auth";

// ---------------------------------------------------------------------------
// הרשאות מודולים לצד המשרד. מנהל (adminRole="manager") רואה הכל תמיד.
// עובד (adminRole="staff") רואה רק את המודולים שאושרו לו (moduleAccess).
// "סקירה כללית" ו"החשבון שלי" פתוחים לכולם ואינם ניתנים להגבלה.
// ---------------------------------------------------------------------------

export interface AdminModule {
  key: string;
  label: string;
  path: string; // תחילית הנתיב לזיהוי בשמירה בשרת
}

// מודולים הניתנים להגבלה לעובד.
export const ADMIN_MODULES: AdminModule[] = [
  { key: "clients", label: "לקוחות", path: "/admin/clients" },
  { key: "tasks", label: "משימות", path: "/admin/tasks" },
  { key: "calendar", label: "לוח שנה", path: "/admin/calendar" },
  { key: "documents", label: "מסמכים", path: "/admin/documents" },
  { key: "quotes", label: "הצעות מחיר", path: "/admin/quotes" },
  { key: "studio", label: "סטודיו", path: "/admin/studio" },
  { key: "organic", label: "קידום אורגני", path: "/admin/organic" },
  { key: "messages", label: "הודעות", path: "/admin/messages" },
  { key: "payments", label: "תשלומים", path: "/admin/payments" },
  { key: "settings", label: "הגדרות", path: "/admin/settings" },
];

export const ADMIN_MODULE_KEYS = ADMIN_MODULES.map((m) => m.key);

// ברירת מחדל לעובד ללא הגדרה: הכל חוץ ממודולים רגישים (הנהלה בלבד).
const MANAGEMENT_ONLY = new Set(["payments"]);
export const DEFAULT_STAFF_MODULES = ADMIN_MODULE_KEYS.filter((k) => !MANAGEMENT_ONLY.has(k));

// המודולים שהמשתמש בפועל רשאי לראות.
export function effectiveAdminModules(user: SessionUser): string[] {
  if (user.role !== "ADMIN") return [];
  if (user.adminRole !== "staff") return ADMIN_MODULE_KEYS; // מנהל — הכל
  const list = user.moduleAccess;
  if (!Array.isArray(list)) return DEFAULT_STAFF_MODULES;
  return list;
}

export function canAccessAdminModule(user: SessionUser, key: string): boolean {
  return effectiveAdminModules(user).includes(key);
}

// גארד לצד השרת: בראש עמוד מודול. עובד ללא הרשאה → הפניה לסקירה.
export async function requireAdminModule(key: string): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/app");
  if (user.adminRole !== "staff") return user; // מנהל — תמיד מותר
  if (!canAccessAdminModule(user, key)) redirect("/admin");
  return user;
}
