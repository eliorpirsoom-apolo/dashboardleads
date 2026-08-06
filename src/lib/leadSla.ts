import { prisma } from "./prisma";
import { getTaskAgentConfig } from "./taskAgent";
import { sendMessage } from "./messaging";

// ---------------------------------------------------------------------------
// Speed-to-Lead — תזכורות אי-טיפול בלידים. רוכב על קרון ה-5 דקות:
// ליד שלא טופל (סטטוס/הערה) תוך X דק' → וואטסאפ למשווק המשויך;
// אחרי Y דק' → הסלמה למנהלי המשרד. נשלח רק בשעות הפעילות (שעון ישראל),
// פעם אחת לכל שלב. שיחה נכנסת שנענתה נחשבת מטופלת.
// ---------------------------------------------------------------------------

const BATCH = 20; // תקרת לידים לטיפול בהרצה אחת
const WINDOW_HOURS = 24; // מזכירים רק על לידים מהיממה האחרונה (לא נובחים על ישנים)

function ilMinutesNow(): number {
  const t = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const [h, m] = t.split(":").map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

function toMin(hhmm: string, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || "").trim());
  if (!m) return fallback;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export interface SlaRunResult {
  checked: number;
  marketerReminders: number;
  escalations: number;
}

export async function runLeadSlaChecks(): Promise<SlaRunResult> {
  const result: SlaRunResult = { checked: 0, marketerReminders: 0, escalations: 0 };
  const cfg = await getTaskAgentConfig();
  if (!cfg.slaEnabled) return result;

  // שעות פעילות — מחוץ להן לא שולחים (הליד יזכה לתזכורת בבוקר).
  const nowMin = ilMinutesNow();
  const start = toMin(cfg.slaWorkStart, 8 * 60);
  const end = toMin(cfg.slaWorkEnd, 20 * 60);
  if (nowMin < start || nowMin >= end) return result;

  const now = Date.now();
  const windowStart = new Date(now - WINDOW_HOURS * 60 * 60 * 1000);
  const marketerDue = new Date(now - cfg.slaMarketerMinutes * 60 * 1000);
  const escalateDue = new Date(now - cfg.slaEscalateMinutes * 60 * 1000);

  const pending = await prisma.lead.findMany({
    where: {
      archived: false,
      firstHandledAt: null,
      receivedAt: { gte: windowStart, lte: marketerDue },
      // שיחה שנענתה = כבר דיברו עם הליד; אין צורך בתזכורת.
      NOT: { kind: "call", callStatus: "נענתה" },
      OR: [{ slaMarketerRemindedAt: null }, { slaEscalatedAt: null, receivedAt: { lte: escalateDue } }],
    },
    orderBy: { receivedAt: "asc" },
    take: BATCH,
    include: {
      assignee: { select: { name: true, whatsappPhone: true, active: true } },
      client: { select: { name: true } },
      project: { select: { name: true } },
      source: { select: { name: true } },
    },
  });
  result.checked = pending.length;
  if (pending.length === 0) return result;

  // מנהלי המשרד להסלמה — וואטסאפ ייעודי אם הוגדר, אחרת הטלפון הרגיל.
  const managers = await prisma.user.findMany({
    where: { role: "ADMIN", adminRole: "manager", active: true },
    select: { whatsappPhone: true, phone: true },
  });
  const managerTargets = managers
    .map((m) => m.whatsappPhone || m.phone)
    .filter((x): x is string => Boolean(x));

  for (const lead of pending) {
    const ageMin = Math.round((now - lead.receivedAt.getTime()) / 60000);
    const who = lead.fullName || lead.phone || "ללא שם";
    const where = lead.project?.name || lead.client?.name || "";

    // שלב 1 — תזכורת למשווק המשויך.
    if (!lead.slaMarketerRemindedAt && lead.assignee?.whatsappPhone && lead.assignee.active) {
      const body =
        `⏰ תזכורת: ליד ממתין לך כבר ${ageMin} דקות!\n\n` +
        `${who}${lead.phone ? ` · ${lead.phone}` : ""}\n` +
        (where ? `פרויקט: ${where}\n` : "") +
        `\n☎️ ליד חם מתקרר מהר — חייג עכשיו ועדכן סטטוס.`;
      await sendMessage({
        channel: "whatsapp",
        to: lead.assignee.whatsappPhone,
        body,
        kind: "automation",
        clientId: lead.clientId,
        leadId: lead.id,
      }).catch(() => {});
      await prisma.lead.update({ where: { id: lead.id }, data: { slaMarketerRemindedAt: new Date() } });
      result.marketerReminders++;
    }

    // שלב 2 — הסלמה למנהלי המשרד.
    if (!lead.slaEscalatedAt && lead.receivedAt <= escalateDue && managerTargets.length > 0) {
      const body =
        `🚨 ליד ללא טיפול ${ageMin} דקות\n\n` +
        `${who}${lead.phone ? ` · ${lead.phone}` : ""}\n` +
        (where ? `פרויקט: ${where}\n` : "") +
        (lead.assignee?.name ? `משווק: ${lead.assignee.name}\n` : "לא משויך למשווק!\n") +
        (lead.source?.name ? `מקור: ${lead.source.name}` : "");
      for (const to of managerTargets) {
        await sendMessage({
          channel: "whatsapp",
          to,
          body,
          kind: "automation",
          clientId: lead.clientId,
          leadId: lead.id,
        }).catch(() => {});
      }
      await prisma.lead.update({ where: { id: lead.id }, data: { slaEscalatedAt: new Date() } });
      result.escalations++;
    }
  }
  return result;
}

// מדד זמן תגובה: ממוצע (טיפול ראשון - קבלה) פר משווק, לתקופה נתונה.
export async function responseTimeStats(days = 7): Promise<
  { name: string; leads: number; avgMinutes: number }[]
> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const leads = await prisma.lead.findMany({
    where: { receivedAt: { gte: since }, firstHandledAt: { not: null }, assigneeId: { not: null } },
    select: { receivedAt: true, firstHandledAt: true, assignee: { select: { name: true } } },
  });
  const agg = new Map<string, { total: number; count: number }>();
  for (const l of leads) {
    const name = l.assignee?.name ?? "—";
    const min = (l.firstHandledAt!.getTime() - l.receivedAt.getTime()) / 60000;
    if (min < 0) continue;
    const cur = agg.get(name) ?? { total: 0, count: 0 };
    cur.total += min;
    cur.count++;
    agg.set(name, cur);
  }
  return [...agg.entries()]
    .map(([name, v]) => ({ name, leads: v.count, avgMinutes: Math.round(v.total / v.count) }))
    .sort((a, b) => a.avgMinutes - b.avgMinutes);
}
