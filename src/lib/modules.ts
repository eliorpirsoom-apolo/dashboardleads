// ---------------------------------------------------------------------------
// Module architecture: a client's `type` decides which feature modules are
// enabled. This is the single place that mapping lives — UI navigation and
// API guards both consult it, so adding a module never touches core code.
// ---------------------------------------------------------------------------

export type ClientType = "general" | "realestate" | "seo";

export type ModuleKey =
  | "leads" // core: leads, statuses, custom fields, intake
  | "tasks" // core: tasks, meetings, calendar, reminders
  | "documents" // core: agreements, invoices, receipts
  | "budgets" // budgets + cost-per-lead
  | "purchases" // purchase requests (realestate + general per spec)
  | "topads" // "2 strongest ads of the month"
  | "broadcasts" // distribution messages + report
  | "realestate" // projects, unit inventory, contracts
  | "seo"; // Search Console / GA4 dashboards

const CORE: ModuleKey[] = [
  "leads",
  "tasks",
  "documents",
  "budgets",
  "purchases",
  "topads",
  "broadcasts",
];

const MODULES_BY_TYPE: Record<ClientType, ModuleKey[]> = {
  general: [...CORE],
  realestate: [...CORE, "realestate"],
  seo: [...CORE, "seo"],
};

export const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: "general", label: "כללי" },
  { value: "realestate", label: 'נדל"ן' },
  { value: "seo", label: "SEO" },
];

export function clientTypeLabel(type: string): string {
  return CLIENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function modulesFor(type: string): ModuleKey[] {
  return MODULES_BY_TYPE[(type as ClientType) in MODULES_BY_TYPE ? (type as ClientType) : "general"];
}

export function hasModule(type: string, module: ModuleKey): boolean {
  return modulesFor(type).includes(module);
}
