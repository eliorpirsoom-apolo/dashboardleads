import { prisma } from "./prisma";
import { sendMessage } from "./messaging";
import { sendWhatsappRaw } from "./whatsapp";

// ---------------------------------------------------------------------------
// התראות הנהלת חשבונות (לוח התשלומים):
// 1) התראה חודשית אוטומטית — לקוחות ריטיינר שלא סומנו "שולם" עד יום X בחודש.
// 2) תזכורות ידניות ("לחייב באשראי ב-23") — נשלחות בבוקר תאריך היעד.
// שני הסוגים נשלחים לאיש הקשר של הנה"ח בערוץ שנבחר (וואטסאפ/מייל/שניהם).
// ---------------------------------------------------------------------------

const TZ = "Asia/Jerusalem";

export async function getBillingConfig() {
  return prisma.billingAlertConfig.upsert({
    where: { key: "billing" },
    update: {},
    create: { key: "billing" },
  });
}

function nowInIsrael(): { y: number; m: number; d: number; hour: number; ym: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  const y = get("year");
  const m = get("month");
  return { y, m, d: get("day"), hour: get("hour"), ym: `${y}-${String(m).padStart(2, "0")}` };
}

// שליחה לאיש הקשר של הנה"ח לפי ערוץ ההגדרות. מחזיר תקציר לשם דיווח.
async function sendToAccounting(
  cfg: { channel: string; contactPhone: string | null; contactEmail: string | null },
  subject: string,
  body: string
): Promise<{ whatsapp?: boolean; email?: boolean }> {
  const out: { whatsapp?: boolean; email?: boolean } = {};
  const wantsWa = cfg.channel === "whatsapp" || cfg.channel === "both";
  const wantsEmail = cfg.channel === "email" || cfg.channel === "both";
  if (wantsWa && cfg.contactPhone) {
    const r = await sendWhatsappRaw(cfg.contactPhone, body).catch(() => ({ ok: false }));
    out.whatsapp = r.ok;
  }
  if (wantsEmail && cfg.contactEmail) {
    const r = await sendMessage({
      channel: "email",
      to: cfg.contactEmail,
      subject,
      body,
      kind: "automation",
    }).catch(() => ({ status: "failed" as const }));
    out.email = r.status === "sent";
  }
  return out;
}

const ILS = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;

// לקוחות ריטיינר שלא שולם עבורם החודש: תא ריטיינר עם סכום צפוי שלא סומן
// בסטטוס "שולם", או לקוח ששילם ריטיינר בחודש הקודם ואין לו תא בכלל החודש.
async function findUnpaidRetainers(y: number, m: number): Promise<{ name: string; amount: number | null }[]> {
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const [current, previous, clients] = await Promise.all([
    prisma.clientPayment.findMany({
      where: { year: y, month: m, kind: "retainer" },
      select: { clientId: true, amount: true, sumitAmount: true, status: { select: { isPaid: true } } },
    }),
    prisma.clientPayment.findMany({
      where: { year: prevY, month: prevM, kind: "retainer" },
      select: { clientId: true, amount: true, sumitAmount: true },
    }),
    prisma.client.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);
  const nameOf = new Map(clients.map((c) => [c.id, c.name]));
  const unpaid: { name: string; amount: number | null }[] = [];
  const seen = new Set<string>();

  for (const c of current) {
    const expected = c.amount ?? c.sumitAmount ?? 0;
    if (!nameOf.has(c.clientId)) continue; // לקוח לא פעיל
    seen.add(c.clientId);
    if (expected > 0 && !c.status?.isPaid) {
      unpaid.push({ name: nameOf.get(c.clientId)!, amount: expected });
    }
  }
  // לקוח ריטיינר מהחודש הקודם שאין לו תא בכלל החודש — כנראה טרם שילם.
  for (const p of previous) {
    if (seen.has(p.clientId) || !nameOf.has(p.clientId)) continue;
    const prevAmount = p.amount ?? p.sumitAmount ?? 0;
    if (prevAmount > 0) {
      seen.add(p.clientId);
      unpaid.push({ name: nameOf.get(p.clientId)!, amount: null });
    }
  }
  return unpaid.sort((a, b) => a.name.localeCompare(b.name, "he"));
}

// נקודת הכניסה מהקרון (כל 5 דק'). force = שליחה מיידית לבדיקה.
export async function processBillingAlerts(force = false): Promise<unknown> {
  const cfg = await getBillingConfig();
  const now = nowInIsrael();
  const result: Record<string, unknown> = {};

  // --- תזכורות ידניות: נשלחות בבוקר (מ-08:00) של תאריך היעד ---
  if (cfg.enabled && (now.hour >= 8 || force)) {
    const endOfToday = new Date(`${now.y}-${String(now.m).padStart(2, "0")}-${String(now.d).padStart(2, "0")}T23:59:59+03:00`);
    const due = await prisma.billingReminder.findMany({
      where: { sentAt: null, dueOn: { lte: endOfToday } },
      orderBy: { dueOn: "asc" },
      take: 10,
    });
    let sent = 0;
    for (const r of due) {
      const body = `🔔 תזכורת הנהלת חשבונות:\n${r.text}`;
      const res = await sendToAccounting(cfg, "תזכורת הנהלת חשבונות — אפולו CRM", body);
      if (res.whatsapp || res.email) {
        await prisma.billingReminder.update({ where: { id: r.id }, data: { sentAt: new Date() } });
        sent++;
      }
    }
    if (due.length) result.reminders = { due: due.length, sent };
  }

  // --- התראת אי-תשלום חודשית: פעם בחודש, ביום שנקבע (מ-08:00) ---
  const monthlyDue = cfg.enabled && now.d >= cfg.alertDay && cfg.lastAlertMonth !== now.ym && (now.hour >= 8 || force);
  if (monthlyDue || force) {
    const unpaid = await findUnpaidRetainers(now.y, now.m);
    if (unpaid.length > 0) {
      const lines = unpaid
        .map((u) => `• ${u.name}${u.amount ? ` — צפוי ${ILS(u.amount)}` : " — טרם נרשמה חשבונית החודש"}`)
        .join("\n");
      const body =
        `💰 גבייה — ${String(now.m).padStart(2, "0")}/${now.y}\n` +
        `לקוחות שטרם סומנו כשולם עד ה-${cfg.alertDay} בחודש (${unpaid.length}):\n\n${lines}\n\n` +
        `לעדכון: לוח התשלומים במערכת.`;
      const res = await sendToAccounting(cfg, `גבייה ${String(now.m).padStart(2, "0")}/${now.y} — לקוחות שטרם שילמו`, body);
      result.monthly = { unpaid: unpaid.length, ...res };
    } else {
      result.monthly = { unpaid: 0, skipped: true };
    }
    if (!force) {
      await prisma.billingAlertConfig.update({ where: { id: cfg.id }, data: { lastAlertMonth: now.ym } });
    }
  }

  return Object.keys(result).length ? result : null;
}
