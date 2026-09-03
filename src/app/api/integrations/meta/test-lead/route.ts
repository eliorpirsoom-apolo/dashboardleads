import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError, requireAdmin } from "@/lib/api";
// פתוח לכל צוות המשרד — חיבור טפסים וניתוב לידים (החלטת הבעלים 2026-09-01).

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GRAPH = "https://graph.facebook.com/v21.0";

const Body = z.object({ id: z.string().min(1), formId: z.string().min(1) });

// POST /api/integrations/meta/test-lead — יצירת ליד בדיקה בטופס Lead Ads
// (מנהל בלבד). על ליד בדיקה מטא שולחת וובהוק גם ב-Development mode, ובנוסף
// המשיכה המחזורית קולטת אותו — בדיקת כל הצינור בלחיצה אחת, בלי כלי מטא
// (שממילא לא מציג עמודים בגישה עסקית).
export const POST = handle(async (req) => {
  await requireAdmin();
  const b = Body.parse(await readJson(req));
  const page = await prisma.metaPage.findUnique({
    where: { id: b.id },
    select: { pageToken: true, pageName: true },
  });
  if (!page) throw new ApiError(404, "החיבור לא נמצא");

  const res = await fetch(`${GRAPH}/${b.formId}/test_leads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: page.pageToken }),
  });
  const data = await res.json();
  if (!res.ok || !data.id) {
    const msg = String(data?.error?.message ?? JSON.stringify(data).slice(0, 200));
    throw new ApiError(
      400,
      /already|exist/i.test(msg)
        ? "כבר קיים ליד בדיקה פעיל לטופס הזה — נסו טופס אחר (מטא מתירה ליד בדיקה אחד פעיל לכל טופס)"
        : `יצירת ליד בדיקה נכשלה: ${msg.slice(0, 200)}`
    );
  }
  return NextResponse.json({ ok: true, leadgenId: String(data.id) });
});
