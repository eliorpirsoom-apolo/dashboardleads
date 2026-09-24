import { aiVision, aiConfigured } from "./ai";
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

const OCR_SYSTEM =
  "אתה עוזר שמפענח דף סיכום פגישה שנכתב ביד (עברית) ומחזיר JSON בלבד. " +
  "קרא את כתב היד, פרק לנקודות בודדות, ולכל נקודה קבע האם היא משימה לביצוע " +
  '(פעולה שצריך לעשות) או הערה/החלטה. החזר אך ורק JSON בצורה: ' +
  '{"points":[{"text":"...","isTask":true|false}]}. בלי טקסט נוסף, בלי הסברים.';

/** פענוח תמונת דף פגישה → נקודות בבולטים + סימון משימות + טקסט גולמי. */
export async function extractMeetingFromImage(
  imageUrl: string
): Promise<{ bullets: Bullet[]; rawText: string }> {
  if (!aiConfigured()) throw new Error("OpenAI לא מוגדר — אי אפשר לפענח את התמונה");
  const out = await aiVision({
    system: OCR_SYSTEM,
    user:
      "פענח את דף סיכום הפגישה בתמונה. החזר JSON עם כל הנקודות לפי הפורמט שהוגדר. " +
      "שמור על הניסוח המקורי ככל האפשר.",
    imageUrl,
    maxTokens: 1800,
  });
  let parsed: any = {};
  try {
    const s = out.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 && end > start ? s.slice(start, end + 1) : s);
  } catch {
    parsed = {};
  }
  const points = Array.isArray(parsed?.points) ? parsed.points : [];
  const bullets = normalizeBullets(
    points.map((p: any) => ({ text: p?.text, isTask: p?.isTask }))
  );
  const rawText = bullets.map((b) => `• ${b.text}`).join("\n");
  return { bullets, rawText };
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
