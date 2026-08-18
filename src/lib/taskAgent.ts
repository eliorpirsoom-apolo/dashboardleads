// ---------------------------------------------------------------------------
// סוכן AI ללכידת משימות מוואטסאפ → המאגר (TaskInbox, source="whatsapp").
// מקבל הודעות רק ממספרים מורשים ("פתק לעצמי"). משתמש במנוע ה-AI הקיים (aiComplete).
// ---------------------------------------------------------------------------

import { prisma } from "./prisma";
import { aiComplete, aiConfigured } from "./ai";
import { waIntl, sendWhatsappRaw, sendWhatsappToChat } from "./whatsapp";

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

// חילוץ משימות עם פירוט מלא (לאבחון): התשובה הגולמית של ה-AI + שגיאה אם הייתה.
export async function extractTasksRaw(
  text: string,
  instructions?: string | null,
  model?: string | null
): Promise<{ tasks: ExtractedTask[]; raw: string; error: string | null }> {
  if (!aiConfigured()) return { tasks: [], raw: "", error: "AI לא מוגדר (OPENAI_API_KEY)" };
  if (!text.trim()) return { tasks: [], raw: "", error: "טקסט ריק" };
  const system =
    `אתה עוזר שמחלץ משימות ותזכורות מהודעות טקסט בעברית של צוות סוכנות פרסום.\n` +
    `מההודעה, חלץ 0 או יותר פריטי משימה קצרים וברורים לביצוע.\n` +
    `- אם ההודעה אינה מכילה משימה (סתם ברכה/שיחה/מידע) — החזר רשימה ריקה.\n` +
    `- כל משימה: כותרת קצרה ופעילה בעברית (עד ~80 תווים).\n` +
    `- אם צוין מועד/דד-ליין — כתוב אותו ב-dueHint (למשל "מחר", "יום ראשון 10:00"); אחרת null.\n` +
    (instructions ? `הנחיות נוספות מהמשתמש: ${instructions}\n` : "") +
    `החזר JSON תקין בלבד, בלי טקסט נוסף, בפורמט: {"tasks":[{"title":"...","dueHint":"..."}]}`;
  try {
    const raw = await aiComplete({ system, user: text.trim().slice(0, 4000), temperature: 0.2, maxTokens: 500, model: model || undefined });
    return { tasks: parseTasks(raw), raw, error: null };
  } catch (e: any) {
    return { tasks: [], raw: "", error: String(e?.message || e).slice(0, 300) };
  }
}

// חילוץ משימות מטקסט חופשי (עברית). מחזיר [] אם אין משימה או שה-AI לא מוגדר.
export async function extractTasks(
  text: string,
  instructions?: string | null,
  model?: string | null
): Promise<ExtractedTask[]> {
  const r = await extractTasksRaw(text, instructions, model);
  if (r.error) console.error("[task-agent:extract]", r.error);
  return r.tasks;
}

// טקסט הפריט במאגר: כותרת + רמז-מועד (אם יש).
function itemText(t: ExtractedTask): string {
  return t.dueHint ? `${t.title} — ${t.dueHint}` : t.title;
}

// שילוב הודעה מצוטטת (Reply) עם הוראת המשתמש — התוכן המצוטט הוא העיקר.
function combineWithQuote(content: string, quotedText?: string | null): string {
  const q = (quotedText || "").trim();
  const c = (content || "").trim();
  if (!q) return c;
  return c ? `${q}\n(הערת המשתמש: ${c})` : q;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// האם ההודעה קוראת בשם הסוכן (כמילה עצמאית, ללא תלות ברישיות)?
export function mentionsAgentName(body: string, name: string): boolean {
  if (!body || !name) return false;
  const re = new RegExp(`(^|[\\s,.:;!?"'()\\-])${escapeRegex(name)}([\\s,.:;!?"'()\\-]|$)`, "i");
  return re.test(body);
}

// הסרת קריאת השם מההודעה כדי להשאיר את תוכן המשימה בלבד.
function stripAgentName(body: string, name: string): string {
  const re = new RegExp(`(^|[\\s,.:;!?"'()\\-])${escapeRegex(name)}([\\s,.:;!?"'()\\-]|$)`, "gi");
  return body
    .replace(re, "$1$2")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.:;!?"'()\-]+/, "")
    .trim();
}

// עיבוד הודעת וואטסאפ נכנסת ע"י הסוכן. מחזיר true אם ההודעה טופלה ע"י הסוכן
// (ואז לא נשמרת כשיחת לקוח). מוסיף משימות למאגר + אישור חזרה אופציונלי.
export async function maybeHandleTaskAgent(input: {
  phone: string;
  body: string;
  senderName?: string | null;
  idMessage?: string | null;
  quotedText?: string | null;
}): Promise<boolean> {
  const cfg = await getTaskAgentConfig();
  if (!cfg.enabled) return false;
  if (!isWhitelisted(cfg.allowedNumbers, input.phone)) return false;
  if (!input.body.trim() && !input.quotedText?.trim()) return true; // ריק — נבלע (לא שיחת לקוח)

  // דדופ מול משלוח חוזר של אותה הודעה (webhook retries).
  if (input.idMessage) {
    const exists = await prisma.taskInbox.findFirst({
      where: { sourceRef: input.idMessage },
      select: { id: true },
    });
    if (exists) return true;
  }

  const tasks = await extractTasks(combineWithQuote(input.body, input.quotedText), cfg.instructions, cfg.model);
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

// עיבוד הודעת קבוצה: פועל רק כשההודעה קוראת בשם הסוכן ("יעקב"). מחלץ משימה,
// מכניס למאגר, ומגיב בקבוצה. מחזיר true אם ההודעה נקראה בשם (טופלה ע"י הסוכן).
export async function maybeHandleGroupAgent(input: {
  groupId: string;
  groupName?: string | null;
  body: string;
  senderName?: string | null;
  idMessage?: string | null;
  quotedText?: string | null;
}): Promise<boolean> {
  const cfg = await getTaskAgentConfig();
  if (!cfg.groupsEnabled) return false;
  const name = (cfg.name || "").trim();
  if (!name || !mentionsAgentName(input.body, name)) return false;

  // דדופ מול משלוח חוזר של אותה הודעה.
  if (input.idMessage) {
    const exists = await prisma.taskInbox.findFirst({
      where: { sourceRef: input.idMessage },
      select: { id: true },
    });
    if (exists) return true;
  }

  // תוכן לחילוץ: אם צוטטה הודעה (Reply) — היא העיקר; ההודעה עם השם היא ההוראה.
  const cleaned = stripAgentName(input.body, name);
  const textForExtraction = combineWithQuote(cleaned, input.quotedText) || input.body;
  const tasks = await extractTasks(textForExtraction, cfg.instructions, cfg.model);
  const byLabel = input.senderName?.trim() || input.groupName?.trim() || "וואטסאפ";
  if (tasks.length > 0) {
    await prisma.taskInbox.createMany({
      data: tasks.map((t) => ({
        text: itemText(t),
        source: "whatsapp",
        sourceRef: input.idMessage || null,
        createdByName: byLabel,
      })),
    });
    if (cfg.replyConfirm) {
      const lines = tasks.map((t) => `• ${itemText(t)}`).join("\n");
      await sendWhatsappToChat(input.groupId, `✅ נוספו למאגר (${tasks.length}):\n${lines}`).catch(() => {});
    }
  } else if (cfg.replyConfirm) {
    await sendWhatsappToChat(input.groupId, "🤔 לא זיהיתי משימה בהודעה.").catch(() => {});
  }
  return true;
}
