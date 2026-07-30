import { prisma } from "./prisma";
import { sendMessage } from "./messaging";
import { parseMsgConfig, effectiveFlags } from "./messagingConfig";
import { clientApprovalUrl } from "./studioLinks";

// תזכורות אישור לקוח לעיצובים + סימון משימות באיחור. רץ מה-cron.

const DAY = 24 * 60 * 60 * 1000;

// תזכורת ללקוח על עיצוב שממתין לאישור — כל יומיים, עד 3 פעמים.
export async function sendDueDesignApprovalReminders(): Promise<number> {
  const now = Date.now();
  const tasks = await prisma.designTask.findMany({
    where: {
      status: "sent_to_client",
      clientNotifiedAt: { not: null },
      remindersSent: { lt: 3 },
    },
    include: {
      client: {
        select: {
          messagingConfig: true,
          users: { where: { active: true }, select: { email: true, phone: true } },
        },
      },
    },
    take: 50,
  });

  let sent = 0;
  for (const t of tasks) {
    if (!t.clientNotifiedAt) continue;
    const dueAt = t.clientNotifiedAt.getTime() + 2 * (t.remindersSent + 1) * DAY;
    if (now < dueAt) continue;

    const eff = effectiveFlags(parseMsgConfig(t.client?.messagingConfig));
    const body = `תזכורת: העיצוב "${t.title}" ממתין לאישורך. לצפייה ואישור: ${clientApprovalUrl(t.approvalToken)}`;
    for (const u of t.client?.users ?? []) {
      if (u.email) {
        await sendMessage({
          channel: "email",
          to: u.email,
          subject: "תזכורת: עיצוב ממתין לאישורך",
          body,
          kind: "reminder",
          clientId: t.clientId,
        }).catch(() => {});
      }
      if (eff.whatsapp && u.phone) {
        await sendMessage({ channel: "whatsapp", to: u.phone, body, kind: "reminder", clientId: t.clientId }).catch(() => {});
      }
    }
    await prisma.designTask.update({
      where: { id: t.id },
      data: { remindersSent: { increment: 1 } },
    });
    sent++;
  }
  return sent;
}

// סימון משימות עיצוב שעבר מועדן ולא הושלמו — לבקרה (נקודה 5).
export async function markOverdueDesignTasks(): Promise<number> {
  const r = await prisma.designTask.updateMany({
    where: {
      overdue: false,
      scheduledAt: { lt: new Date() },
      status: { in: ["scheduled", "in_progress", "client_feedback"] },
    },
    data: { overdue: true },
  });
  return r.count;
}
