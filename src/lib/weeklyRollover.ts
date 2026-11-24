import { prisma } from "@/lib/prisma";
import { ilWeekStartUTC } from "@/lib/time";

// גלגול "רשימת השבוע": כל משימה שלא בוצעה ושייכת לשבוע קודם עוברת אוטומטית
// לשבוע הנוכחי — בדיוק כמו העתקת הדף הידנית בכל יום ראשון בבוקר.
// אידמפוטנטי: אחרי ההעברה אין יותר משימות עם weekStart קטן מהנוכחי, כך
// שהרצה חוזרת באותו שבוע לא תזיז דבר.
export async function rolloverWeeklyTasks(now = new Date()) {
  const weekStart = ilWeekStartUTC(now);
  const res = await prisma.weeklyTask.updateMany({
    where: { done: false, weekStart: { lt: weekStart } },
    data: { weekStart },
  });
  return { movedTasks: res.count, weekStart: weekStart.toISOString() };
}
