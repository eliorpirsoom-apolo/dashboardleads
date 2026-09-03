import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ApiError, requireAdmin } from "@/lib/api";
// פתוח לכל צוות המשרד — חיבור טפסים וניתוב לידים (החלטת הבעלים 2026-09-01).
import crypto from "crypto";
import {
  getPageToken,
  subscribePageToLeadgen,
  verifyUserToken,
} from "@/lib/integrations/metaLeads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/integrations/meta/attach — חיבור העמוד הנבחר לפרויקט:
// טוקן עמוד ← מקור קליטה ייעודי ← רישום לוובהוק leadgen.
export const POST = handle(async (req) => {
  const user = await requireAdmin();
  const form = await req.formData();
  const pageId = String(form.get("pageId") ?? "");
  const pageNameRaw = String(form.get("pageName") ?? "");
  const projectId = String(form.get("projectId") ?? "");
  const clientId = String(form.get("clientId") ?? "");
  const blob = String(form.get("blob") ?? "");

  if (!pageId || !clientId) throw new ApiError(400, "חסרים פרטים");
  const userToken = verifyUserToken(blob);
  if (!userToken) throw new ApiError(403, "החיבור פג — התחילו שוב");

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true },
  });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");
  // חיבור ברמת הלקוח: projectId ריק. מלא = פרויקט ברירת מחדל (תאימות לאחור).
  const project = projectId
    ? await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, clientId: true },
      })
    : null;
  if (projectId && (!project || project.clientId !== clientId)) {
    throw new ApiError(404, "פרויקט לא נמצא");
  }

  const existing = await prisma.metaPage.findUnique({ where: { pageId } });
  if (existing) throw new ApiError(409, "העמוד כבר מחובר");

  // טוקן העמוד + רישום לוובהוק — לפני כתיבה ל-DB, שלא יישאר חיבור מת.
  const page = await getPageToken(pageId, userToken);
  const pageName = page.name || pageNameRaw || pageId;
  await subscribePageToLeadgen(pageId, page.token);

  // מקור קליטה ייעודי לעמוד — הלידים נכנסים דרך צינור הקליטה הרגיל.
  // בלי פרויקט: לידים מטפסים לא-משויכים נשמרים ברמת הלקוח וממתינים לשיוך.
  const source = await prisma.leadSource.create({
    data: {
      clientId,
      projectId: project?.id ?? null,
      name: `פייסבוק — ${pageName}`.slice(0, 120),
      token: `src_${crypto.randomBytes(18).toString("hex")}`,
      kind: "form",
      channel: "facebook",
      platform: "facebook",
    },
  });
  await prisma.metaPage.create({
    data: {
      clientId,
      projectId: project?.id ?? null,
      sourceId: source.id,
      pageId,
      pageName,
      pageToken: page.token,
      connectedById: user.id,
    },
  });

  const base = process.env.APP_BASE_URL || "https://app.apolloadv.co.il";
  return NextResponse.redirect(
    project
      ? `${base}/admin/clients/${clientId}/projects/${project.id}?meta=connected`
      : `${base}/admin/clients/${clientId}/settings?meta=connected`,
    { status: 303 }
  );
});
