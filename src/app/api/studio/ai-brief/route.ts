import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { aiConfigured, aiComplete } from "@/lib/ai";
import { briefTypeLabel } from "@/lib/studio";

export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().max(200).optional(),
  briefType: z.string().max(40).optional(),
  notes: z.string().min(2, "כתבו כמה נקודות לניסוח").max(3000),
});

// POST /api/studio/ai-brief — הופך נקודות גולמיות לבריף עיצוב מסודר (OpenAI).
export const POST = handle(async (req) => {
  await requireAdmin();
  if (!aiConfigured()) throw new ApiError(400, "עוזר ה-AI אינו מוגדר (חסר מפתח OpenAI)");
  const b = Body.parse(await readJson(req));
  const brief = await aiComplete({
    system:
      "אתה מנהל סטודיו במשרד פרסום ישראלי. קח נקודות גולמיות והפוך אותן לבריף עיצוב " +
      "ברור ומסודר בעברית למעצב/ת. כלול: מטרה, קהל יעד, מסר מרכזי, טקסטים לכלול, " +
      "סגנון/צבעים, מה חובה לכלול, ומה להימנע. תמציתי, מעשי, בנקודות. בלי הקדמות.",
    user:
      `סוג עבודה: ${briefTypeLabel(b.briefType || "")}\n` +
      `כותרת: ${b.title || ""}\n` +
      `נקודות גולמיות:\n${b.notes}`,
    temperature: 0.5,
    maxTokens: 600,
  });
  return NextResponse.json({ brief });
});
