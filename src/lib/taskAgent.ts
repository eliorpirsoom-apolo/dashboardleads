// ---------------------------------------------------------------------------
// סוכן AI ללכידת משימות מוואטסאפ → המאגר (TaskInbox, source="whatsapp").
// מקבל הודעות רק ממספרים מורשים ("פתק לעצמי"). משתמש במנוע ה-AI הקיים (aiComplete).
// ---------------------------------------------------------------------------

import { prisma } from "./prisma";
import { aiComplete, aiConfigured } from "./ai";
import { waIntl, sendWhatsappRaw } from "./whatsapp";

export interface ExtractedTask {
  title: string;
  dueHint?: string | null;
}

const AGENT_KEY = "task-capture";

export async function getTaskAgentConfig() {
  return prisma.aiAgentConfig.upsert({
    where: { key: AGENT_KEY },
    update: {},
    create: { key: AGENT_KEY },
  });
}

// רשימת מספרים מורשים מנורמלת לפורמט בינ"ל.
function allowedList(raw: string): string[] {
  return (raw || "")
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => waIntl(x))
    .filter(Boolean);
}

export function isWhitelisted(allowedNumbers: string, phone: string): boolean {
  const target = waIntl(phone);
  if (!target) return false;
  return allowedList(allowedNumbers).includes(target);
}

// פירוק תשובת ה-AI ל-JSON גמיש (מסיר code-fences, מאתר את האובייקט).
function parseTasks(raw: string): ExtractedTask[] {
  if (!raw) return [];
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    const obj = JSON.parse(s);
    const arr = Array.isArray(obj) ? obj : obj.tasks;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((t: any) => ({
        title: String(t?.title ?? "").trim().slice(0, 200),
        dueHint: t?.dueHint ? String(t.dueHint).trim().slice(0, 80) : null,
      }))
      .filter((t) => t.title.length > 0)
      .slice(0, 10);
  } catch {
    return [];
  }
}

// חילוץ משימות מטקסט חופשי (עברית). מחזיר [] אם אין משימה או שה-AI לא מוגדר.
export async function extractTasks(
  text: string,
  instructions?: string | null,
  model?: string | null
): Promise<ExtractedTask[]> {
  if (!aiConfigured() || !text.trim()) return [];
  const system =
    `אתה עוזר שמחלץ משימות ותזכורות מהודעות טקסט בעברית של צוות סוכנות פרסום.\n` +
    `מההודעה, חלץ 0 או יותר פריטי משימה קצרים וברורים לביצוע.\n` +
    `- אם ההודעה אינה מכילה משימה (סתם ברכה/שיחה/מידע) — החזר רשימה ריקה.\n` +
    `- כל משימה: כותרת קצרה ופעילה בעברית (עד ~80 תווים).\n` +
    `- אם צוין מועד/דד-ליין — כתוב אותו ב-dueHint (למשל "מחר", "יום ראשון 10:00"); אחרת null.\n` +
    (instructions ? `הנחיות נוספות מהמשתמש: ${instructions}\n` : "") +
    `החזר JSON תקין בלבד, בלי טקסט נוסף, בפורמט: {"tasks":[{"title":"...","dueHint":"..."}]}`;
  let raw = "";
  try {
    raw = await aiComplete({ system, user: text.trim().slice(0, 4000), temperature: 0.2, maxTokens: 500, model: model || undefined });
  } catch {
    return [];
  }
  return parseTasks(raw);
}

// טקסט הפריט במאגר: כותרת + רמז-מועד (אם יש).
function itemText(t: ExtractedTask): string {
  return t.dueHint ? `${t.title} — ${t.dueHint}` : t.title;
}

// עיבוד הודעת וואטסאפ נכנסת ע"י הסוכן. מחזיר true אם ההודעה טופלה ע"י הסוכן
// (ואז לא נשמרת כשיחת לקוח). מוסיף משימות למאגר + אישור חזרה אופציונלי.
export async function maybeHandleTaskAgent(input: {
  phone: string;
  body: string;
  senderName?: string | null;
  idMessage?: string | null;
}): Promise<boolean> {
  const cfg = await getTaskAgentConfig();
  if (!cfg.enabled) return false;
  if (!isWhitelisted(cfg.allowedNumbers, input.phone)) return false;
  if (!input.body.trim()) return true; // ממספר מורשה אך ריק — נבלע (לא שיחת לקוח)

  // דדופ מול משלוח חוזר של אותה הודעה (webhook retries).
  if (input.idMessage) {
    const exists = await prisma.taskInbox.findFirst({
      where: { sourceRef: input.idMessage },
      select: { id: true },
    });
    if (exists) return true;
  }

  const tasks = await extractTasks(input.body, cfg.instructions, cfg.model);
  if (tasks.length > 0) {
    await prisma.taskInbox.createMany({
      data: tasks.map((t) => ({
        text: itemText(t),
        source: "whatsapp",
        sourceRef: input.idMessage || null,
        createdByName: input.senderName?.trim() || "וואטסאפ",
      })),
    });
    if (cfg.replyConfirm) {
      const lines = tasks.map((t) => `• ${itemText(t)}`).join("\n");
      await sendWhatsappRaw(input.phone, `✅ נוספו למאגר (${tasks.length}):\n${lines}`).catch(() => {});
    }
  }
  return true;
}
