import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError, requireAdmin } from "@/lib/api";
// פתוח לכל צוות המשרד — חיבור טפסים וניתוב לידים (החלטת הבעלים 2026-09-01).

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

const Body = z.object({
  pageDbId: z.string().min(1),
  formId: z.string().min(1),
});

// POST /api/integrations/meta/forms/archive — ארכוב טופס לידים בפייסבוק
// (כל צוות המשרד). טופס בארכיון מפסיק לקבל לידים ובדיקת כיסוי הטפסים מתעלמת
// ממנו. משתמש בטוקן העמוד השמור; הפיך מספריית הטפסים של פייסבוק.
export const POST = handle(async (req) => {
  await requireAdmin();
  const b = Body.parse(await readJson(req));
  const page = await prisma.metaPage.findUnique({ where: { id: b.pageDbId } });
  if (!page) throw new ApiError(404, "החיבור לא נמצא");

  const res = await fetch(`${GRAPH}/${b.formId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ status: "ARCHIVED", access_token: page.pageToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new ApiError(
      502,
      `ארכוב הטופס נכשל: ${JSON.stringify(data?.error ?? data).slice(0, 200)}`
    );
  }
  return NextResponse.json({ ok: true });
});
