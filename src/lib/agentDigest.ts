import { prisma } from "./prisma";
import { sendMessage } from "./messaging";
import { formatTime } from "./format";
import { ilDayStart, ilDayEnd } from "./time";

// ---------------------------------------------------------------------------
// ☀️ תקציר בוקר למשווקים (צד לקוח): "היום — X חזרות, Y פגישות, Z לידים
// חדשים ממתינים". נשלח בוואטסאפ פעם ביום בחלון 08:30-09:30 (שעון ישראל),
// רק למשווקים שיש להם משהו על השולחן. דדופ לפי הודעה שנשלחה היום.
// ---------------------------------------------------------------------------

const DIGEST_MARK = "תקציר בוקר למשווק";

function ilMinutesNow(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export async function sendAgentMorningDigests(force = false): Promise<number> {
  const nowMin = ilMinutesNow();
  if (!force && (nowMin < 8 * 60 + 30 || nowMin > 9 * 60 + 30)) return 0;

  const now = new Date();
  const dayStart = ilDayStart(now);
  const dayEnd = ilDayEnd(now);

  // משווקים פעילים עם מספר טלפון (צד לקוח).
  const agents = await prisma.user.findMany({
    where: { role: "CLIENT", isAgent: true, active: true, phone: { not: null } },
    select: { id: true, name: true, phone: true, clientId: true },
  });
  let sent = 0;

  for (const agent of agents) {
    if (!agent.phone || !agent.clientId) continue;
    // דדופ יומי — הודעת תקציר אחת ביום.
    const already = await prisma.message.findFirst({
      where: {
        to: agent.phone,
        kind: "reminder",
        subject: DIGEST_MARK,
        createdAt: { gte: dayStart },
      },
      select: { id: true },
    });
    if (already) continue;

    const [newLeads, dueToday, overdue, meetings] = await Promise.all([
      prisma.lead.count({
        where: { clientId: agent.clientId, archived: false, assigneeId: agent.id, firstHandledAt: null },
      }),
      prisma.task.count({
        where: {
          assigneeId: agent.id,
          status: { in: ["open", "in_progress"] },
          type: { not: "meeting" },
          dueAt: { gte: dayStart, lt: dayEnd },
        },
      }),
      prisma.task.count({
        where: {
          assigneeId: agent.id,
          status: { in: ["open", "in_progress"] },
          dueAt: { lt: dayStart },
        },
      }),
      prisma.task.findMany({
        where: {
          assigneeId: agent.id,
          status: { in: ["open", "in_progress"] },
          type: "meeting",
          dueAt: { gte: dayStart, lt: dayEnd },
        },
        orderBy: { dueAt: "asc" },
        select: { title: true, dueAt: true },
        take: 5,
      }),
    ]);

    if (newLeads + dueToday + overdue + meetings.length === 0) continue; // אין מה לדווח

    const lines = [
      `☀️ בוקר טוב ${agent.name.split(" ")[0]}! הנה היום שלך:`,
      newLeads > 0 ? `🆕 ${newLeads} לידים חדשים ממתינים למענה ראשון` : null,
      dueToday > 0 ? `📞 ${dueToday} חזרות ללידים להיום` : null,
      overdue > 0 ? `🔴 ${overdue} משימות באיחור — כדאי לסגור קודם` : null,
      meetings.length > 0
        ? `📅 פגישות היום:\n${meetings.map((m) => `   • ${formatTime(m.dueAt)} ${m.title}`).join("\n")}`
        : null,
      `\nהכל מחכה לך בלוח: app.apolloadv.co.il/app`,
    ].filter(Boolean);

    const res = await sendMessage({
      channel: "whatsapp",
      to: agent.phone,
      subject: DIGEST_MARK,
      body: lines.join("\n"),
      kind: "reminder",
      clientId: agent.clientId,
    });
    if (res.status === "sent") sent++;
  }
  return sent;
}
