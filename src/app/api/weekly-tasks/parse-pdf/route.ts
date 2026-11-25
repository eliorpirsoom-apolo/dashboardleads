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
      max_tokens: 4000,
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

  // חילוץ ה-JSON: אובייקט {tasks:[...]}, או מערך [...] גולמי, גם מתוך טקסט עוטף.
  let arr: unknown = null;
  const stripped = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(stripped);
    arr = Array.isArray(parsed) ? parsed : Array.isArray((parsed as any)?.tasks) ? (parsed as any).tasks : null;
  } catch {
    const a = stripped.indexOf("[");
    const z2 = stripped.lastIndexOf("]");
    if (a >= 0 && z2 > a) {
      try {
        arr = JSON.parse(stripped.slice(a, z2 + 1));
      } catch {
        /* ignore */
      }
    }
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
