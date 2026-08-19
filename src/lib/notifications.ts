import { prisma } from "./prisma";
import { sendMessage } from "./messaging";

const APP_URL = process.env.APP_BASE_URL || "https://app.apolloadv.co.il";

// ---------------------------------------------------------------------------
// התראות פנימיות (תיוג @ בעדכונים): רשומת Notification לפעמון שבסיידבר,
// ומייל למתויג — אלא אם כיבה זאת ב"חשבון שלי" (mentionEmails=false).
// ---------------------------------------------------------------------------

export async function createMentionNotifications(opts: {
  actor: { id: string; name: string };
  mentionedIds: string[];
  taskId: string;
  taskTitle: string;
  snippet: string;
}): Promise<number> {
  const ids = [...new Set(opts.mentionedIds)].filter(Boolean).slice(0, 20);
  if (ids.length === 0) return 0;
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, role: "ADMIN", active: true },
    select: { id: true, name: true, email: true, mentionEmails: true },
  });
  if (users.length === 0) return 0;

  const snippet = opts.snippet.length > 200 ? `${opts.snippet.slice(0, 200)}…` : opts.snippet;
  const link = `/admin/studio?task=${opts.taskId}`;
  const text = `${opts.actor.name} תייג/ה אותך בעדכון על "${opts.taskTitle}": ${snippet}`;

  await prisma.notification.createMany({
    data: users.map((u) => ({ userId: u.id, kind: "mention", text, link, actorName: opts.actor.name })),
  });

  for (const u of users) {
    if (!u.mentionEmails || !u.email) continue;
    await sendMessage({
      channel: "email",
      to: u.email,
      subject: `💬 ${opts.actor.name} תייג/ה אותך — ${opts.taskTitle}`,
      body:
        `היי ${u.name},\n\n${opts.actor.name} תייג/ה אותך בעדכון על המשימה "${opts.taskTitle}":\n` +
        `"${snippet}"\n\nלצפייה ומענה: ${APP_URL}${link}\n\n` +
        `(אפשר לכבות מיילים על תיוגים ב"חשבון שלי" במערכת — ההתראה בפעמון תישאר.)`,
      kind: "automation",
    }).catch(() => {});
  }
  return users.length;
}
