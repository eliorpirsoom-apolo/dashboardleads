import { NextResponse } from "next/server";
import { handle, ApiError, readJson, requireAdmin } from "@/lib/api";
// פתוח לכל צוות המשרד — חיבור טפסים וניתוב לידים (החלטת הבעלים 2026-09-01).
import { pullRecentLeads } from "@/lib/integrations/metaLeads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/integrations/meta/pull {id, days?} — משיכת לידים אחרונים מהעמוד
// המחובר (גיבוי לוובהוק + אימות חיבור). מנהל בלבד.
export const POST = handle(async (req) => {
  await requireAdmin();
  const b = (await readJson(req)) as { id?: string; days?: number };
  if (!b?.id) throw new ApiError(400, "חסר מזהה עמוד");
  const days = Math.min(Math.max(Number(b.days) || 30, 1), 90);
  const result = await pullRecentLeads(String(b.id), days);
  return NextResponse.json(result);
});
