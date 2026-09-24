import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { extractMeetingFromImage } from "@/lib/meetingSummary";
import { getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/meetings/[id]/reprocess — פענוח מחדש של תמונת הפגישה השמורה
// (מודל gpt-4o), החלפת הבולטים. שימושי כשה-OCR הראשוני יצא חלש.
export const POST = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const m = await prisma.meetingSummary.findUnique({ where: { id: params.id } });
  if (!m) throw new ApiError(404, "סיכום לא נמצא");
  const keys: string[] = (() => {
    try {
      return JSON.parse(m.photoKeys || "[]");
    } catch {
      return [];
    }
  })();
  if (keys.length === 0) throw new ApiError(400, "אין תמונה לסיכום — פענוח מחדש אפשרי רק לסיכום שנקלט מצילום");

  const key = keys[0];
  const bytes = await getObject(key);
  const mime = key.endsWith(".png") ? "image/png" : "image/jpeg";
  const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

  const ex = await extractMeetingFromImage(dataUrl);
  if (ex.bullets.length === 0) {
    throw new ApiError(422, "עדיין לא הצלחתי לפענח טקסט מהתמונה — נסו תמונה חדה יותר או השלימו ידנית");
  }
  await prisma.meetingSummary.update({
    where: { id: m.id },
    data: { bullets: JSON.stringify(ex.bullets), rawText: ex.rawText },
  });
  return NextResponse.json({ ok: true, pointCount: ex.bullets.length, taskCount: ex.bullets.filter((b) => b.isTask).length });
});
