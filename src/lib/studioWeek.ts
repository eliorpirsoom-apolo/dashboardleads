import { prisma } from "@/lib/prisma";
import { ilWeekLabel } from "@/lib/time";

// פתיחת "קבוצת השבוע" בלוח הסטודיו (סגנון Monday) — אוטומציה של מה שנעשה ידני:
// כל יום ראשון נפתחת קבוצה חדשה בשם התאריכים של השבוע (ראשון→שבת), וכל המשימות
// שעדיין לא אושרו נמשכות אליה.
//
// החלטות (מאושר מול הלקוח):
//  • רק קיבוץ — משנים groupId בלבד, בלי לגעת ב-scheduledAt/dueAt/יומן Google.
//  • "פתוח" = כל סטטוס חוץ מ-"approved".
//  • כל המשימות הפתוחות, מכל קבוצה (וגם ללא-קבוצה), מתרכזות בקבוצת השבוע.
//  • Idempotent לפי שם הקבוצה — אם כבר קיימת (נוצרה בריצה קודמת או ידנית), משתמשים בה.
//  • חדש-למעלה — הקבוצה נכנסת לראש הלוח.
export async function openCurrentWeekGroup(now = new Date()) {
  const name = ilWeekLabel(now);

  let group = await prisma.designGroup.findFirst({ where: { name } });
  let created = false;
  if (!group) {
    // orderIndex מתחת למינימום הקיים → הקבוצה החדשה מופיעה ראשונה בלוח.
    const top = await prisma.designGroup.findFirst({
      orderBy: { orderIndex: "asc" },
      select: { orderIndex: true },
    });
    group = await prisma.designGroup.create({
      data: { name, orderIndex: (top?.orderIndex ?? 0) - 1 },
    });
    created = true;
  }

  // כל משימה פתוחה שאינה כבר בקבוצה — לקבוצת השבוע. ה-OR מבטיח שגם משימות
  // ללא-קבוצה (groupId = null) נמשכות (Prisma מחריג null מ-`not` רגיל).
  const res = await prisma.designTask.updateMany({
    where: {
      status: { not: "approved" },
      OR: [{ groupId: null }, { groupId: { not: group.id } }],
    },
    data: { groupId: group.id },
  });

  return { name, groupId: group.id, created, movedTasks: res.count };
}
