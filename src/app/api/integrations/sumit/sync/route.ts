import { NextResponse } from "next/server";
import { handle, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { sumitConfigured } from "@/lib/integrations/sumit";
import { syncSumit } from "@/lib/integrations/sumitSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/integrations/sumit/sync — משיכת מסמכים/הצעות מ-SUMIT. מנהל בלבד.
export const POST = handle(async () => {
  await requireManager();
  if (!sumitConfigured()) throw new ApiError(400, "SUMIT לא מוגדר (חסרים משתני סביבה)");
  const result = await syncSumit();
  return NextResponse.json({ ok: true, ...result });
});

// GET — סטטוס מהיר (האם מוגדר).
export const GET = handle(async () => {
  await requireManager();
  return NextResponse.json({ configured: sumitConfigured() });
});
