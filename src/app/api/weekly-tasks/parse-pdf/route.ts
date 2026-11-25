import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, handle, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";
import { aiConfigured, aiReadDocument } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CATEGORY_LABELS = ["גבייה", "פגישות", "משימות משרד", "קמפיינים", "ימי צילום", "משימות שונות"];

const Req = z.object({
  dataUrl: z.string().min(1), // "data:application/pdf;base64,..."
  fileName: z.string().optional().nullable(),
});

// POST /api/weekly-tasks/parse-pdf — חילוץ משימות ממסמך PDF/תמונה באמצעות GPT-4o.
// מחזיר שורות גולמיות לסקירה בלבד (לא יוצר כלום) — היצירה היא דרך /import לאחר אישור.
export const POST = handle(async (req) => {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "tasks")) throw new ApiError(403, "אין הרשאה למודול המשימות");
  if (!aiConfigured()) throw new ApiError(503, "קריאת PDF דורשת חיבור ל-GPT (OPENAI_API_KEY) — לא מוגדר");

  const b = Req.parse(await readJson(req));
  const mime = b.dataUrl.slice(5, b.dataUrl.indexOf(";")) || "application/pdf";

  const raw = await aiReadDocument({
    system: "אתה קורא מסמך של רשימת משימות שבועית במשרד פרסום ומחזיר JSON בלבד, ללא טקסט נוסף וללא code-fences.",
    user:
      "המסמך מכיל משימות המחולקות לקטגוריות ראשיות, ותחתן לפי לקוח ולפי פרויקט. " +
      "חלץ את כל המשימות והחזר מערך JSON יחיד בלבד, שבו כל פריט הוא: " +
      '{"category": קטגוריה, "client": שם הלקוח או "", "project": שם הפרויקט או "", "title": תיאור המשימה, "note": הערה או ""}. ' +
      `הערך של "category" חייב להיות אחד מ: ${CATEGORY_LABELS.map((c) => `"${c}"`).join(", ")} — ` +
      'אם לא ברור, החזר "". אל תמציא משימות שלא כתובות במסמך. ' +
      "שמור על סדר ההופעה במסמך. בלי הסברים, בלי code-fences — רק מערך JSON.",
    dataUrl: b.dataUrl,
    mime,
    fileName: b.fileName || "tasks.pdf",
    maxTokens: 3000,
  });

  // חילוץ מערך ה-JSON מהתשובה (הסרת code-fences וטקסט עוטף).
  let rows: unknown = [];
  try {
    let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const a = s.indexOf("[");
    const z2 = s.lastIndexOf("]");
    if (a >= 0 && z2 > a) s = s.slice(a, z2 + 1);
    rows = JSON.parse(s);
  } catch {
    throw new ApiError(422, "לא הצלחתי לקרוא את המסמך. נסו קובץ ברור יותר או ייבוא Excel/CSV.");
  }

  const clean = (Array.isArray(rows) ? rows : [])
    .map((r: any) => ({
      category: String(r?.category ?? "").trim().slice(0, 40),
      client: String(r?.client ?? "").trim().slice(0, 120),
      project: String(r?.project ?? "").trim().slice(0, 120),
      title: String(r?.title ?? "").trim().slice(0, 400),
      note: String(r?.note ?? "").trim().slice(0, 2000),
    }))
    .filter((r) => r.title);

  return NextResponse.json({ rows: clean });
});
