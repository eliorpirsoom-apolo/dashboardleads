import { hasModule, type ModuleKey } from "./modules";

// ---------------------------------------------------------------------------
// Navigation definitions for both sides. Client-side items are filtered by
// the client's enabled modules — adding a module never touches the shell.
// ---------------------------------------------------------------------------

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  module?: ModuleKey;
}

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "סקירה כללית", icon: "home" },
  { href: "/admin/clients", label: "לקוחות", icon: "users" },
  { href: "/admin/tasks", label: "משימות", icon: "tasks" },
  { href: "/admin/calendar", label: "לוח שנה", icon: "calendar" },
  { href: "/admin/documents", label: "מסמכים", icon: "folder" },
  { href: "/admin/quotes", label: "הצעות מחיר", icon: "money" },
  { href: "/admin/studio", label: "סטודיו", icon: "edit" },
  { href: "/admin/messages", label: "הודעות", icon: "megaphone" },
  { href: "/admin/settings", label: "הגדרות", icon: "settings" },
  { href: "/admin/profile", label: "החשבון שלי", icon: "users" },
];

const CLIENT_NAV: (NavItem & { agentBlocked?: boolean })[] = [
  { href: "/app", label: "סקירה כללית", icon: "home" },
  { href: "/app/leads", label: "לידים", icon: "leads", module: "leads" },
  { href: "/app/projects", label: "פרויקטים", icon: "building", module: "projects" },
  { href: "/app/gantt", label: "תוכנית עבודה", icon: "calendar" },
  { href: "/app/purchases", label: "בקשות רכישה", icon: "money", module: "purchases" },
  { href: "/app/tasks", label: "משימות", icon: "tasks", module: "tasks" },
  { href: "/app/calendar", label: "לוח שנה", icon: "calendar", module: "tasks" },
  { href: "/app/reports", label: "דוחות", icon: "chart", module: "budgets" },
  { href: "/app/seo", label: "SEO", icon: "search", module: "seo" },
  { href: "/app/broadcasts", label: "הודעות תפוצה", icon: "megaphone", module: "broadcasts", agentBlocked: true },
  { href: "/app/documents", label: "מסמכים", icon: "folder", module: "documents" },
  { href: "/app/studio", label: "עיצובים לאישור", icon: "edit" },
  { href: "/app/settings", label: "הגדרות", icon: "settings", agentBlocked: true },
  { href: "/app/profile", label: "החשבון שלי", icon: "users" },
];

// Navigation reflects the permission model: sales agents don't see
// configuration surfaces (settings, broadcasts) — "הבעלים מגדיר, הסוכן עובד".
export function clientNavFor(clientType: string, isAgent = false): NavItem[] {
  return CLIENT_NAV.filter(
    (item) =>
      (!item.module || hasModule(clientType, item.module)) &&
      (!isAgent || !item.agentBlocked)
  );
}
