import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { metaEnabled, metaRedirectUri, packMetaState } from "@/lib/integrations/metaLeads";

export const dynamic = "force-dynamic";

// GET /api/integrations/meta/connect?projectId=... — תחילת חיבור עמוד פייסבוק
// לפרויקט (מנהל בלבד). מפנה לדיאלוג ההרשאות של Meta.
export const GET = handle(async (req) => {
  await requireManager();
  if (!metaEnabled()) {
    throw new ApiError(400, "חיבור Meta לא מוגדר (META_APP_ID/SECRET חסרים בסביבה)");
  }
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) throw new ApiError(400, "חסר projectId");
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientId: true },
  });
  if (!project) throw new ApiError(404, "פרויקט לא נמצא");

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: metaRedirectUri(),
    state: packMetaState(project.clientId, project.id),
    // pages_manage_ads — נדרש לקריאת רשימת טפסי הלידים (משיכת לידים אחורה).
    scope: "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_manage_ads,leads_retrieval",
    response_type: "code",
  });
  return NextResponse.redirect(`https://www.facebook.com/v21.0/dialog/oauth?${params}`);
});
