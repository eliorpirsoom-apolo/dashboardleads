import { prisma } from "./prisma";
import { sendMessage, channelConfigured } from "./messaging";

// ---------------------------------------------------------------------------
// "מכולת" — רשימת החומרים שהמשרד צריך מהלקוח לפרויקט. תבניות פר-סוג,
// מייל בקשה בפתיחת פרויקט, ותזכורות עד שהחומרים מתקבלים.
// ---------------------------------------------------------------------------

export const DEFAULT_TEMPLATES: { name: string; items: string[] }[] = [
  {
    name: "לקוחות כללי",
    items: [
      "לוגו (קובץ וקטורי — AI/EPS/SVG אם יש)",
      "שפה עיצובית — צבעים ופונטים",
      "תמונות / וידאו של העסק",
      "טקסטים ותוכן",
      "כתובות מייל ליצירת קשר",
      "מספרי טלפון",
      "כתובת האתר",
      "גישה לאתר (משתמש/סיסמה או הרשאה)",
      "גישה לדומיין (ספק ופרטי כניסה)",
      "גישה לשרת/אחסון",
      "גישה לעמודי הרשתות החברתיות",
      "פרופיל חברה / אודות",
    ],
  },
  {
    name: 'לקוחות נדל"ן',
    items: [
      "לוגו הפרויקט",
      "הדמיות",
      "תוכניות דירה",
      "מפרט טכני",
      "מחירון עדכני",
      "שפה עיצובית — צבעים ופונטים",
      "פרטי משרד מכירות (טלפון/כתובת/שעות)",
      "כתובת אתר הפרויקט וגישה אליו",
      "תמונות מהשטח / סביבה",
      "כתובות מייל וטלפונים ליצירת קשר",
    ],
  },
  {
    name: "SEO",
    items: [
      "גישה ל-Google Search Console",
      "גישה ל-Google Analytics",
      "גישה לאתר / מערכת ניהול התוכן (CMS)",
      "גישה ל-Google Business Profile",
      "מילות מפתח מועדפות",
      "אזורים/ערים לקידום",
      "פרטי העסק המלאים (שם, כתובת, טלפון)",
      "מתחרים עיקריים",
    ],
  },
];

/** זריעת תבניות ברירת מחדל בפעם הראשונה. */
export async function ensureDefaultTemplates(): Promise<void> {
  const count = await prisma.materialTemplate.count();
  if (count > 0) return;
  await prisma.$transaction(
    DEFAULT_TEMPLATES.map((t, i) =>
      prisma.materialTemplate.create({
        data: { name: t.name, items: JSON.stringify(t.items), order: i },
      })
    )
  );
}

export function parseItems(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** מייל בקשת חומרים ללקוח + (SMS/וואטסאפ אם מחובר). מסמן requestedAt. */
export async function sendMaterialsRequest(
  projectId: string,
  isReminder = false
): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: { select: { contactEmail: true, contactPhone: true, name: true } },
      materials: { orderBy: { order: "asc" } },
    },
  });
  if (!project) return false;
  const to = project.client.contactEmail;
  const items = project.materials.filter((m) => !m.received);
  if (items.length === 0) return false;

  const appUrl = process.env.APP_BASE_URL || "https://dashboard-leads-apollo13.vercel.app";
  const list = items.map((m) => `• ${m.label}`).join("\n");
  const openLine = isReminder
    ? `תזכורת ידידותית 🙂 — כדי שנוכל להתקדם בפרויקט "${project.name}", נשמח לקבל את החומרים הבאים:`
    : `כדי שנתחיל לעבוד על "${project.name}", נצטרך מכם את החומרים הבאים:`;
  const body =
    `שלום,\n\n${openLine}\n\n${list}\n\n` +
    `אפשר להשיב למייל הזה עם החומרים, או לתאם איתנו העברה.\n` +
    `תודה,\nצוות Apollo\n${appUrl}`;
  const subject = isReminder
    ? `תזכורת: חומרים לפרויקט ${project.name}`
    : `חומרים נדרשים לפרויקט ${project.name} — Apollo`;

  const smsBody = `${isReminder ? "תזכורת מ-Apollo" : "Apollo"}: לפרויקט "${project.name}" חסרים לנו חומרים (${items.length} פריטים). שלחנו פירוט למייל 🙏`;

  let sent = false;
  if (to) {
    const r = await sendMessage({
      channel: "email",
      to,
      subject,
      body,
      kind: "system",
      clientId: project.clientId,
    });
    sent = r.status === "sent" || r.status === "skipped";
  }
  const phone = project.client.contactPhone;
  if (phone) {
    for (const ch of ["sms", "whatsapp"] as const) {
      if (channelConfigured(ch)) {
        await sendMessage({ channel: ch, to: phone, body: smsBody, kind: "system", clientId: project.clientId });
      }
    }
  }

  await prisma.project.update({
    where: { id: projectId },
    data: isReminder
      ? {
          materialsRemindersSent: { increment: 1 },
          materialsLastRemindedAt: new Date(),
        }
      : { materialsRequestedAt: new Date() },
  });
  return sent;
}

/** תזכורות "מכולת" — כל יומיים, עד 3. רץ מתוך cron התזכורות. */
export async function sendDueMaterialReminders(): Promise<number> {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const due = await prisma.project.findMany({
    where: {
      materialsReceived: false,
      materialsRequestedAt: { not: null, lte: twoDaysAgo },
      materialsRemindersSent: { lt: 3 },
      status: "active",
      OR: [
        { materialsLastRemindedAt: null },
        { materialsLastRemindedAt: { lte: twoDaysAgo } },
      ],
    },
    select: { id: true },
    take: 50,
  });
  let sent = 0;
  for (const p of due) {
    try {
      if (await sendMaterialsRequest(p.id, true)) sent++;
    } catch (err) {
      console.error("[materials reminder]", err);
    }
  }
  return sent;
}
