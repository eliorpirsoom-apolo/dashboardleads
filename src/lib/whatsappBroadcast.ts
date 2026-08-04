// ---------------------------------------------------------------------------
// בוט תזמון לקבוצות וואטסאפ — הודעת בוקר + סוף-יום לכל הקבוצות שהמספר חבר בהן.
// רוכב על ה-cron שרץ כל ~5 דק': שולח כשעובר הזמן שהוגדר (שעון ישראל),
// פעם אחת ליום (dedup לפי תאריך), בתוך חלון חסד של שעתיים.
// ---------------------------------------------------------------------------

import { prisma } from "./prisma";
import { getTaskAgentConfig } from "./taskAgent";
import { listWhatsappGroups, sendWhatsappToChat } from "./whatsapp";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const GRACE_MIN = 120; // חלון שליחה: עד שעתיים אחרי הזמן שהוגדר (מונע "בוקר טוב" ב-17:00 אם ה-cron פספס)

function ilNow(): { date: string; minutes: number; dayIdx: number } {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // YYYY-MM-DD
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now); // HH:MM
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "long" }).format(now);
  return { date, minutes: toMin(time), dayIdx: WEEKDAYS.indexOf(weekday) };
}

function toMin(hhmm: string): number {
  const [h, m] = (hhmm || "0:0").split(":").map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

async function sendToAllGroups(text: string): Promise<number> {
  const groups = await listWhatsappGroups();
  let sent = 0;
  for (const g of groups) {
    const r = await sendWhatsappToChat(g.id, text);
    if (r.ok) sent++;
  }
  return sent;
}

// force=true — שליחה מיידית לבדיקה (מתעלם מהזמן/יום; עדיין שולח לכל הקבוצות!).
export async function runWhatsappBroadcast(
  force = false
): Promise<{ morning: number | false; eod: number | false }> {
  const cfg = await getTaskAgentConfig();
  const out = { morning: false as number | false, eod: false as number | false };
  if (!cfg.broadcastEnabled && !force) return out;

  const { date, minutes, dayIdx } = ilNow();
  const days = (cfg.broadcastDays || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!force && !days.includes(String(dayIdx))) return out;

  const morningMin = toMin(cfg.morningTime);
  const eodMin = toMin(cfg.eodTime);

  const morningDue =
    force || (cfg.lastMorningSentOn !== date && minutes >= morningMin && minutes < morningMin + GRACE_MIN);
  const eodDue =
    force || (cfg.lastEodSentOn !== date && minutes >= eodMin && minutes < eodMin + GRACE_MIN);

  if (morningDue && cfg.morningText.trim()) {
    out.morning = await sendToAllGroups(cfg.morningText.trim());
    await prisma.aiAgentConfig.update({ where: { id: cfg.id }, data: { lastMorningSentOn: date } });
  }
  if (eodDue && cfg.eodText.trim()) {
    out.eod = await sendToAllGroups(cfg.eodText.trim());
    await prisma.aiAgentConfig.update({ where: { id: cfg.id }, data: { lastEodSentOn: date } });
  }
  return out;
}
