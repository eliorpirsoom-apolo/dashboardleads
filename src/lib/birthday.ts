import { prisma } from "./prisma";
import { sendMessage } from "./messaging";
import { aiConfigured, aiComplete } from "./ai";
import { IL_TZ } from "./time";

// ---------------------------------------------------------------------------
// 🎂 ברכת יום הולדת ללקוח — מייל + SMS, פעם בשנה, בבוקר יום ההולדת.
// הניסוח מיוצר כל פעם מחדש ע"י OpenAI (שונה בכל פעם), ומסתיים ב"מאחלים, אפולו פרסום".
// רץ מה-cron; שער זמן לשעה 9 בבוקר (שעון ישראל) + דדופ שנתי לכל לקוח.
// ---------------------------------------------------------------------------

function ilPart(now: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: IL_TZ, ...opts }).format(now);
}
function ilMonthDay(now = new Date()): string {
  // en-GB מחזיר "dd/mm" — מנרמל ל-"MM-DD".
  const [d, m] = ilPart(now, { month: "2-digit", day: "2-digit" }).split("/");
  return `${m}-${d}`;
}
function ilHour(now = new Date()): number {
  return Number(ilPart(now, { hour: "2-digit", hourCycle: "h23" }));
}
function ilYear(now = new Date()): number {
  return Number(ilPart(now, { year: "numeric" }));
}

const CLOSING = "מאחלים, אפולו פרסום";

const FALLBACK = [
  "יום הולדת שמח, {name}! 🎉 שתהיה לך שנה מלאה בהצלחות, צמיחה והרבה רגעים טובים.",
  "מזל טוב ליום ההולדת, {name}! 🎂 מאחלים לך שנה של הגשמה, בריאות ושמחה אמיתית.",
  "{name} יקר/ה, יום הולדת שמח! ✨ שתתמלא השנה הזו בהזדמנויות חדשות ובהמון סיבות לחייך.",
  "חוגגים אותך, {name}! 🥳 שתהיה שנה מדהימה, עם הצלחות גדולות בעסקים ובחיים.",
];

async function greetingText(name: string): Promise<string> {
  const nm = (name || "").trim() || "לקוח יקר";
  if (aiConfigured()) {
    try {
      const g = await aiComplete({
        system:
          "אתה כותב ברכות יום הולדת חמות, אישיות וקצרות בעברית מטעם משרד פרסום בשם 'אפולו פרסום'. " +
          "2–3 משפטים, טון חם ומקצועי, אימוג'י אחד או שניים לכל היותר. " +
          `סיים תמיד בשורה נפרדת בדיוק כך: '${CLOSING}'. בלי גרשיים עוטפים ובלי כותרת.`,
        user: `כתוב ברכת יום הולדת ל${nm}. שתהיה מקורית ושונה מברכות קודמות.`,
        temperature: 0.95,
        maxTokens: 220,
      });
      if (g) return g.includes(CLOSING) ? g : `${g}\n\n${CLOSING}`;
    } catch (err) {
      console.error("[birthday:ai]", err);
    }
  }
  const idx = Math.floor(Date.now() / 86_400_000) % FALLBACK.length;
  return `${FALLBACK[idx].replace(/\{name\}/g, nm)}\n\n${CLOSING}`;
}

export async function sendDueBirthdayGreetings(force = false): Promise<number> {
  const now = new Date();
  if (!force && ilHour(now) !== 9) return 0; // חלון בוקר
  const today = ilMonthDay(now);
  const year = ilYear(now);

  const clients = await prisma.client.findMany({
    where: { active: true, birthday: { not: null } },
    select: {
      id: true,
      name: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      birthday: true,
      lastBirthdayGreetYear: true,
    },
  });

  let sent = 0;
  for (const c of clients) {
    if (!c.birthday || c.birthday.length < 10) continue;
    if (c.birthday.slice(5, 10) !== today) continue; // "YYYY-MM-DD" → "MM-DD"
    if (!force && c.lastBirthdayGreetYear === year) continue;

    const body = await greetingText(c.contactName || c.name);
    const subject = "🎂 מזל טוב מאפולו פרסום!";
    try {
      if (c.contactEmail)
        await sendMessage({ channel: "email", to: c.contactEmail, subject, body, kind: "automation", clientId: c.id });
      if (c.contactPhone)
        await sendMessage({ channel: "sms", to: c.contactPhone, body, kind: "automation", clientId: c.id });
      await prisma.client.update({ where: { id: c.id }, data: { lastBirthdayGreetYear: year } });
      sent++;
    } catch (err) {
      console.error("[birthday:send]", c.id, err);
    }
  }
  return sent;
}
