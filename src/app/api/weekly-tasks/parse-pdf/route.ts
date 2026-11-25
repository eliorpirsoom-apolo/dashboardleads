import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, handle, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";
import { aiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const CATEGORY_LABELS = ["גבייה", "פגישות", "משימות משרד", "קמפיינים", "ימי צילום", "משימות שונות"];

const Req = z.object({
  dataUrl: z.string().min(1), // "data:<mime>;base64,..."
  fileName: z.string().optional().nullable(),
});

// אוסף כל אובייקט JSON מאוזן (בכל עומק) מתוך טקסט, תוך התעלמות ממרכאות.
// עמיד לתשובה שנקטעה: אובייקט שלא נסגר פשוט לא נאסף.
function balancedJsonObjects(text: string): any[] {
  const out: any[] = [];
  const stack: number[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") stack.push(i);
    else if (ch === "}") {
      const start = stack.pop();
      if (start !== undefined) {
        try {
          out.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          /* skip incomplete/invalid */
        }
      }
    }
  }
  return out;
}

const SYSTEM =
  "אתה מחלץ רשימת משימות שבועית של משרד פרסום ממסמך (PDF/תמונה, מודפס או בכתב יד) " +
  "ומחזיר JSON בלבד. גם אם המסמך מבולגן או בכתב יד — עשה כמיטב יכולתך ואל תסרב.";

const PROMPT =
  "במסמך יש משימות המחולקות לקטגוריות ראשיות, ותחתן לפי לקוח ולפי פרויקט. " +
  'החזר אובייקט JSON יחיד בצורה: {"tasks": [ {"category": "", "client": "", "project": "", "title": "", "note": ""}, ... ]}. ' +
  `הערך של "category" צריך להיות אחד מ: ${CATEGORY_LABELS.map((c) => `"${c}"`).join(", ")} — אם לא ברור, החזר "". ` +
  'שדה "title" הוא תיאור המשימה (חובה). אל תמציא משימות שלא כתובות. שמור על סדר ההופעה. ' +
  'אם אין משימות כלל — החזר {"tasks": []}. בלי טקסט נוסף, בלי code-fences.';

// POST /api/weekly-tasks/parse-pdf — חילוץ משימות ממסמך PDF/תמונה ב-GPT-4o.
// מחזיר שורות גולמיות לסקירה בלבד (לא יוצר כלום) — היצירה דרך /import לאחר אישור.
export const POST = handle(async (req) => {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "tasks")) throw new ApiError(403, "אין הרשאה למודול המשימות");
  if (!aiConfigured()) throw new ApiError(503, "קריאת PDF דורשת חיבור ל-GPT (OPENAI_API_KEY) — לא מוגדר");

  const b = Req.parse(await readJson(req));
  const mime = b.dataUrl.slice(5, b.dataUrl.indexOf(";")) || "application/pdf";
  const fileName = b.fileName || "tasks.pdf";
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(fileName);
  const part = isPdf
    ? { type: "file", file: { filename: fileName, file_data: b.dataUrl } }
    : { type: "image_url", image_url: { url: b.dataUrl } };

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4o",
      temperature: 0.1,
      max_tokens: 12000, // רשימה ארוכה לא תיחתך באמצע ה-JSON
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: [{ type: "text", text: PROMPT }, part] },
      ],
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    console.error("[weekly-parse-pdf] OpenAI", res.status, bodyText.slice(0, 500));
    throw new ApiError(502, `שגיאת קריאה מה-AI (HTTP ${res.status}). נסו שוב, או ייבוא Excel/CSV.`);
  }

  let content = "";
  let finish = "";
  try {
    const j = JSON.parse(bodyText);
    content = j.choices?.[0]?.message?.content ?? "";
    finish = j.choices?.[0]?.finish_reason ?? "";
  } catch {
    /* ignore */
  }
  console.error("[weekly-parse-pdf] finish=%s len=%d head=%s", finish, content.length, content.slice(0, 200));

  // חילוץ ה-JSON: קודם ניסיון נקי ({tasks:[...]} או מערך). אם נכשל (כולל תשובה
  // שנקטעה באמצע) — אוספים כל אובייקט-משימה שלם בנפרד, כך שאובייקט אחרון חסר
  // פשוט מדולג במקום להפיל את כל הקובץ.
  const stripped = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let arr: any[] | null = null;
  try {
    const parsed = JSON.parse(stripped);
    if (Array.isArray(parsed)) arr = parsed;
    else if (Array.isArray(parsed?.tasks)) arr = parsed.tasks;
  } catch {
    /* fall through to salvage */
  }
  if (!arr) {
    const objs = balancedJsonObjects(stripped).filter((o) => o && typeof o.title === "string");
    if (objs.length) arr = objs;
  }

  if (!Array.isArray(arr)) {
    const snippet = (content || "(תשובה ריקה מה-AI)").replace(/\s+/g, " ").trim().slice(0, 160);
    throw new ApiError(422, `לא הצלחתי לחלץ משימות מהמסמך. תשובת ה-AI: ״${snippet}״. נסו קובץ ברור יותר או ייבוא Excel/CSV.`);
  }

  const clean = arr
    .map((r: any) => ({
      category: String(r?.category ?? "").trim().slice(0, 40),
      client: String(r?.client ?? "").trim().slice(0, 120),
      project: String(r?.project ?? "").trim().slice(0, 120),
      title: String(r?.title ?? "").trim().slice(0, 400),
      note: String(r?.note ?? "").trim().slice(0, 2000),
    }))
    .filter((r) => r.title);

  if (clean.length === 0) {
    throw new ApiError(422, "לא נמצאו משימות במסמך. ודאו שהקובץ כולל רשימת משימות, או נסו ייבוא Excel/CSV.");
  }

  return NextResponse.json({ rows: clean });
});
