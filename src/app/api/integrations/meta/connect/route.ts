import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ApiError, requireAdmin } from "@/lib/api";
// פתוח לכל צוות המשרד — חיבור טפסים וניתוב לידים (החלטת הבעלים 2026-09-01).
import { metaEnabled, metaRedirectUri, packMetaState } from "@/lib/integrations/metaLeads";

export const dynamic = "force-dynamic";

// הרשאות לחיבור לידים (Lead Ads).
// pages_manage_ads — נדרש לקריאת רשימת טפסי הלידים (משיכת לידים אחורה).
// business_management — דפים ששותפו לתיק העסקי (שיתוף שותף מלקוח) לא חוזרים
// מ-/me/accounts; ההרשאה הזו מאפשרת לאסוף אותם דרך התיקים העסקיים.
const LEADS_SCOPE =
  "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_manage_ads,leads_retrieval,business_management";

// הרשאות לתיבת המענה החברתי (SOCIAL_INBOX_PLAN.md §7).
// pages_read_user_content — בלעדיה Meta לא מעבירה תוכן של תגובות שמשתמשים כתבו.
// pages_manage_engagement / pages_messaging / instagram_manage_* — נדרשות
// לשליחה (שלב 1c); מבקשים כבר עכשיו כדי לא לחבר את הדף פעמיים.
const SOCIAL_SCOPE =
  "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_read_user_content," +
  "pages_manage_engagement,pages_messaging,instagram_basic,instagram_manage_comments," +
  "instagram_manage_messages,business_management";

// GET /api/integrations/meta/connect?clientId=... — תחילת חיבור עמוד פייסבוק
// ברמת הלקוח (מנהל בלבד). מפנה לדיאלוג ההרשאות של Meta.
// ?projectId= נתמך לתאימות לאחור — הפרויקט הופך לברירת המחדל לטפסים לא-משויכים.
// ?purpose=social — חיבור לתיבת המענה החברתי (תגובות/הודעות) במקום ללידים.
export const GET = handle(async (req) => {
  await requireAdmin();
  if (!metaEnabled()) {
    throw new ApiError(400, "חיבור Meta לא מוגדר (META_APP_ID/SECRET חסרים בסביבה)");
  }
  const sp = new URL(req.url).searchParams;
  const purpose = sp.get("purpose") === "social" ? "social" : "leads";
  const projectId = purpose === "leads" ? sp.get("projectId") : null;
  const clientIdParam = sp.get("clientId");
  let clientId = "";
  let defaultProjectId = "";
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true },
    });
    if (!project) throw new ApiError(404, "פרויקט לא נמצא");
    clientId = project.clientId;
    defaultProjectId = project.id;
  } else if (clientIdParam) {
    const client = await prisma.client.findUnique({
      where: { id: clientIdParam },
      select: { id: true },
    });
    if (!client) throw new ApiError(404, "לקוח לא נמצא");
    clientId = client.id;
  } else {
    throw new ApiError(400, "חסר clientId");
  }

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: metaRedirectUri(),
    state: packMetaState(clientId, defaultProjectId, purpose),
    scope: purpose === "social" ? SOCIAL_SCOPE : LEADS_SCOPE,
    response_type: "code",
  });
  return NextResponse.redirect(`https://www.facebook.com/v21.0/dialog/oauth?${params}`);
});
