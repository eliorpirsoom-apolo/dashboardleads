import { prisma } from "./prisma";
import { sendMessage } from "./messaging";

// ---------------------------------------------------------------------------
// תזכורת וואטסאפ לצוות לפני יום צילום — רוכב על קרון התזכורות (כל 5 דק').
// כל יום צילום ב-24 השעות הקרובות שטרם הוזכר → וואטסאפ לכל איש-צוות פעיל,
// פעם אחת (reminderSent). התראה תפעולית פנימית → יוצאת מהמופע של הסוכנות.
// ---------------------------------------------------------------------------

export async function runShootReminders(): Promise<number> {
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const shoots = await prisma.shootDay.findMany({
    where: {
      reminderSent: false,
      date: { gte: now, lte: soon },
      status: { notIn: ["delivered"] },
    },
    orderBy: { date: "asc" },
    take: 30,
    include: {
      client: { select: { name: true } },
      project: { select: { name: true } },
      crew: {
        include: {
          user: { select: { name: true, whatsappPhone: true, phone: true, active: true } },
        },
      },
    },
  });
  if (shoots.length === 0) return 0;

  let sent = 0;
  for (const s of shoots) {
    const when = new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem",
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(s.date);

    const body =
      `🎬 תזכורת: יום צילום מתקרב!\n\n` +
      (s.title ? `${s.title}\n` : "") +
      (s.client?.name ? `לקוח: ${s.client.name}${s.project?.name ? ` · ${s.project.name}` : ""}\n` : "") +
      `מתי: ${when}\n` +
      (s.location ? `מיקום: ${s.location}\n` : "") +
      `\nבהצלחה! 📸`;

    // נמענים ייחודיים — וואטסאפ ייעודי אם יש, אחרת הטלפון. רק צוות פעיל.
    const targets = new Set<string>();
    for (const c of s.crew) {
      if (!c.user?.active) continue;
      const to = c.user.whatsappPhone || c.user.phone;
      if (to) targets.add(to);
    }
    for (const to of targets) {
      await sendMessage({
        channel: "whatsapp",
        to,
        subject: "תזכורת יום צילום",
        body,
        kind: "automation",
        clientId: s.clientId,
      }).catch(() => {});
    }
    // מסמנים גם כשאין צוות/מספר — כדי שלא ייבדק שוב בכל ריצה.
    await prisma.shootDay.update({ where: { id: s.id }, data: { reminderSent: true } });
    if (targets.size > 0) sent++;
  }
  return sent;
}
