import { prisma } from "./prisma";
import { sendMessage } from "./messaging";
import { ilDayStart, ilDayEnd, ilDateKey } from "./time";
import { formatTime } from "./format";
import { wonDeals } from "./wins";

// ---------------------------------------------------------------------------
// ☕ תקציר בוקר — מייל יומי לצוות המשרד ב-08:00 (שעון ישראל).
// רוכב על מנוע התזכורות (שרץ כל 5 דקות): בשעה 8 בבוקר נשלח פעם אחת ביום.
// מה בפנים: לידים של אתמול (סה"כ + פילוח לקוחות), עסקאות שנסגרו,
// והפגישות/משימות של היום.
// ---------------------------------------------------------------------------

export async function maybeSendMorningDigest(force = false): Promise<boolean> {
  const now = new Date();
  const hourIL = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now)
  );
  if (!force && hourIL !== 8) return false;

  const subject = `☕ תקציר בוקר — ${ilDateKey(now)}`;
  const already = await prisma.message.findFirst({
    where: { kind: "system", subject, createdAt: { gte: ilDayStart(now) } },
  });
  if (already && !force) return false;

  const dayStart = ilDayStart(now);
  const dayEnd = ilDayEnd(now);
  const yStart = ilDayStart(new Date(dayStart.getTime() - 12 * 60 * 60 * 1000));

  const [yLeads, deals, todayTasks] = await Promise.all([
    prisma.lead.findMany({
      where: { archived: false, receivedAt: { gte: yStart, lt: dayStart } },
      select: { client: { select: { name: true } } },
    }),
    wonDeals(yStart, dayStart),
    prisma.task.findMany({
      where: {
        ownerSide: "agency",
        status: "open",
        dueAt: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { dueAt: "asc" },
      take: 15,
      include: {
        client: { select: { name: true } },
        assignee: { select: { name: true } },
      },
    }),
  ]);

  // פילוח לידים של אתמול לפי לקוח.
  const perClient = new Map<string, number>();
  for (const l of yLeads) {
    perClient.set(l.client.name, (perClient.get(l.client.name) ?? 0) + 1);
  }
  const leadLines =
    yLeads.length === 0
      ? "אתמול לא נכנסו לידים חדשים."
      : [
          `אתמול נכנסו ${yLeads.length} לידים:`,
          ...[...perClient.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `  • ${name}: ${count}`),
        ].join("\n");

  const dealLines =
    deals.length === 0
      ? ""
      : `\n\n🔥 עסקאות שנסגרו אתמול (${deals.length}):\n` +
        deals
          .map(
            (d) =>
              `  • ${d.fullName ?? `ליד #${d.number}`} — ${d.projectName ?? d.clientName}`
          )
          .join("\n");

  const taskLines =
    todayTasks.length === 0
      ? "\n\nאין משימות משרד להיום. יום נקי! ☀️"
      : `\n\nעל הפרק היום (${todayTasks.length}):\n` +
        todayTasks
          .map(
            (t) =>
              `  • ${formatTime(t.dueAt)} — ${t.title}` +
              (t.client ? ` (${t.client.name})` : "") +
              (t.assignee ? ` · ${t.assignee.name}` : "")
          )
          .join("\n");

  const body =
    `בוקר טוב! ☀️ הנה תמונת המצב של אפולו:\n\n` +
    leadLines +
    dealLines +
    taskLines +
    `\n\nלמערכת: https://dashboard-leads-apollo13.vercel.app/admin`;

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
  });
  for (const admin of admins) {
    await sendMessage({
      channel: "email",
      to: admin.email,
      subject,
      body,
      kind: "system",
    });
  }
  return true;
}
