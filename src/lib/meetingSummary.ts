import { aiVision, aiComplete, aiConfigured } from "./ai";
import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// מודול סיכומי פגישות: פענוח דף פגישה מצולם (OCR+AI) לנקודות בבולטים עם
// סימון "משימה", בניית כותרת, ופורמט נקי לשליחה ללקוח (בלי המטלות הפנימיות).
// ---------------------------------------------------------------------------

export interface Bullet {
  id: string;
  text: string;
  isTask: boolean; // משימה פנימית לביצוע?
  clientVisible: boolean; // האם להציג ללקוח בהודעת הסיכום (ברירת מחדל: לא-משימה)
  assigneeId?: string | null;
  dueAt?: string | null;
  taskId?: string | null; // המשימה שנוצרה במודול המשימות
  done?: boolean;
}

function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** נירמול בולטים מקלט חופשי (JSON מ-AI או מהעורך) לצורה בטוחה. */
export function normalizeBullets(raw: unknown): Bullet[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((b: any) => {
      const text = String(b?.text ?? "").trim();
      if (!text) return null;
      const isTask = Boolean(b?.isTask);
      return {
        id: String(b?.id ?? rid()),
        text: text.slice(0, 1000),
        isTask,
        clientVisible: b?.clientVisible === undefined ? !isTask : Boolean(b.clientVisible),
        assigneeId: b?.assigneeId ?? null,
        dueAt: b?.dueAt ?? null,
        taskId: b?.taskId ?? null,
        done: Boolean(b?.done),
      } as Bullet;
    })
    .filter((b): b is Bullet => b !== null)
    .slice(0, 200);
}

// הנחיית פירוק משותפת (תמונה/טקסט): נקודות + סימון משימה + ניחוש אחראי/יעד.
function extractionRules(): string {
  const today = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
  const iso = new Date().toISOString().slice(0, 10);
  return (
    "פרק את התוכן לנקודות בודדות (כל פריט = נקודה). לכל נקודה קבע:\n" +
    '- "isTask": true אם זו משימה לביצוע (פעולה שצריך לעשות — בד"כ מתחילה בפועל ' +
    "בצורת מקור: לבצע/להכין/לשלוח/לבדוק/לעדכן/ליצור/להוסיף/להוריד); false אם זו הערה, " +
    "החלטה או מידע.\n" +
    '- "assignee": שם האדם האחראי אם הוזכר במפורש עבור הנקודה, אחרת "".\n' +
    `- "due": אם הוזכר מועד/דדליין — החזר תאריך ISO בפורמט YYYY-MM-DD יחסית להיום (${today}, כלומר ${iso}); אחרת "".\n` +
    'החזר אך ורק JSON תקין: {"points":[{"text":"...","isTask":true,"assignee":"","due":""}]}. ' +
    "בלי טקסט נוסף, בלי סימוני markdown."
  );
}

function ocrSystem(): string {
  return (
    "אתה מומחה לתמלול כתב יד בעברית מדף סיכום פגישה. קרא בקפידה את הכתוב בתמונה ותמלל " +
    "אותו *מדויק*, מילה במילה, בלי להמציא תוכן ובלי לתקן משמעות. אם מילה לא ברורה — תן את " +
    "הפירוש הסביר ביותר לפי ההקשר.\n" + extractionRules()
  );
}

function parseJsonPoints(out: string): any[] {
  let parsed: any = {};
  try {
    const s = out.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 && end > start ? s.slice(start, end + 1) : s);
  } catch {
    parsed = {};
  }
  return Array.isArray(parsed?.points) ? parsed.points : [];
}

// המרת נקודות מה-AI לבולטים + פתרון שם אחראי ל-userId + נירמול תאריך יעד.
async function pointsToBullets(points: any[]): Promise<Bullet[]> {
  const needAssignee = points.some((p: any) => String(p?.assignee || "").trim());
  const agents = needAssignee
    ? await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true, name: true } })
    : [];
  const norm = (s: string) => s.replace(/["'׳״.\-]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const resolveAgent = (name: string): string | null => {
    const n = norm(name);
    if (!n) return null;
    const hit = agents.find((a) => norm(a.name) === n) || agents.find((a) => norm(a.name).includes(n) || n.includes(norm(a.name)));
    return hit?.id ?? null;
  };
  const validDue = (s: string): string | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
    const d = new Date(s + "T12:00:00");
    return isNaN(d.getTime()) ? null : d.toISOString();
  };
  return normalizeBullets(
    points.map((p: any) => {
      const isTask = Boolean(p?.isTask);
      return {
        text: p?.text,
        isTask,
        assigneeId: isTask ? resolveAgent(String(p?.assignee || "")) : null,
        dueAt: isTask ? validDue(String(p?.due || "")) : null,
      };
    })
  );
}

/** פענוח תמונת דף פגישה → נקודות בבולטים + סימון משימות + אחראי/יעד + טקסט גולמי.
 *  ברירת המחדל gpt-4o (מדויק בכתב יד עברי); ניתן לכוונן ב-OPENAI_VISION_MODEL. */
export async function extractMeetingFromImage(
  imageUrl: string
): Promise<{ bullets: Bullet[]; rawText: string }> {
  if (!aiConfigured()) throw new Error("OpenAI לא מוגדר — אי אפשר לפענח את התמונה");
  const out = await aiVision({
    system: ocrSystem(),
    user:
      "תמלל את דף סיכום הפגישה שבתמונה, מילה במילה, ופרק לנקודות. " +
      "החזר JSON לפי הפורמט שהוגדר. שמור על הניסוח המקורי במדויק.",
    imageUrl,
    model: process.env.OPENAI_VISION_MODEL || "gpt-4o",
    temperature: 0.1,
    maxTokens: 2000,
  });
  const bullets = await pointsToBullets(parseJsonPoints(out));
  return { bullets, rawText: bullets.map((b) => `• ${b.text}`).join("\n") };
}

/** פירוק סיכום פגישה מטקסט חופשי (למשל תמלול הודעה קולית) → בולטים + משימות. */
export async function extractMeetingFromText(
  text: string
): Promise<{ bullets: Bullet[]; rawText: string }> {
  if (!aiConfigured()) throw new Error("OpenAI לא מוגדר");
  const out = await aiComplete({
    system:
      "אתה עוזר שמפרק סיכום פגישה בעברית (טקסט/תמלול) לנקודות מסודרות.\n" + extractionRules(),
    user: `פרק את סיכום הפגישה הבא לנקודות לפי הפורמט:\n\n${text.slice(0, 8000)}`,
    temperature: 0.2,
    maxTokens: 1500,
  });
  const bullets = await pointsToBullets(parseJsonPoints(out));
  return { bullets, rawText: bullets.map((b) => `• ${b.text}`).join("\n") };
}

/** כותרת אוטומטית: "סיכום פגישה | לקוח | dd/mm/yyyy". */
export function buildMeetingTitle(clientName: string, date: Date): string {
  const d = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  return `סיכום פגישה | ${clientName} | ${d}`;
}

/** פורמט הודעת הוואטסאפ ללקוח — הסיכום בלבד, בלי המטלות הפנימיות של המשרד. */
export function formatSummaryForClient(opts: {
  clientName: string;
  meetingDate: Date;
  bullets: Bullet[];
}): string {
  const d = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(opts.meetingDate);
  // רק נקודות שסומנו להצגה ללקוח (ברירת מחדל: כל מה שאינו משימה פנימית).
  const lines = opts.bullets.filter((b) => b.clientVisible).map((b) => `• ${b.text}`);
  return (
    `📝 *סיכום פגישה*\n` +
    `${opts.clientName} · ${d}\n\n` +
    (lines.length ? lines.join("\n") : "—") +
    `\n\nתודה על הפגישה! נשמח לכל שאלה 🙏`
  );
}

/** איתור לקוח שמוזכר בתוך טקסט חופשי (תמלול הודעה קולית) — השם הארוך ביותר
 *  שמופיע בטקסט מנצח (למנוע התאמה חלקית שגויה). */
export async function findClientInText(
  text: string
): Promise<{ id: string; name: string } | null> {
  const t = (text || "").toLowerCase();
  if (!t) return null;
  const clients = await prisma.client.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });
  const norm = (s: string) => s.replace(/["'׳״.\-]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const nt = norm(text);
  const matches = clients
    .filter((c) => {
      const n = norm(c.name);
      return n.length >= 3 && nt.includes(n);
    })
    .sort((a, b) => b.name.length - a.name.length);
  return matches[0] ?? null;
}

/** התאמת לקוח לפי שם (מדויק → מכיל → מוכל) — לזיהוי מבוט הוואטסאפ. */
export async function matchClientByName(
  name: string
): Promise<{ id: string; name: string } | null> {
  const q = (name || "").trim();
  if (!q) return null;
  const clients = await prisma.client.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });
  const norm = (s: string) => s.replace(/["'׳״.\-]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const nq = norm(q);
  return (
    clients.find((c) => norm(c.name) === nq) ||
    clients.find((c) => norm(c.name).includes(nq) || nq.includes(norm(c.name))) ||
    null
  );
}
