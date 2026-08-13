import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
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
  const user = await requireManager();
  const form = await req.formData();
  const pageId = String(form.get("pageId") ?? "");
  const pageNameRaw = String(form.get("pageName") ?? "");
  const projectId = String(form.get("projectId") ?? "");
  const clientId = String(form.get("clientId") ?? "");
  const blob = String(form.get("blob") ?? "");

  if (!pageId || !projectId || !clientId) throw new ApiError(400, "חסרים פרטים");
  const userToken = verifyUserToken(blob);
  if (!userToken) throw new ApiError(403, "החיבור פג — התחילו שוב מהפרויקט");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, clientId: true },
  });
  if (!project || project.clientId !== clientId) throw new ApiError(404, "פרויקט לא נמצא");

  const existing = await prisma.metaPage.findUnique({ where: { pageId } });
  if (existing) throw new ApiError(409, "העמוד כבר מחובר");

  // טוקן העמוד + רישום לוובהוק — לפני כתיבה ל-DB, שלא יישאר חיבור מת.
  const page = await getPageToken(pageId, userToken);
  const pageName = page.name || pageNameRaw || pageId;
  await subscribePageToLeadgen(pageId, page.token);

  // מקור קליטה ייעודי לעמוד — הלידים נכנסים דרך צינור הקליטה הרגיל.
  const source = await prisma.leadSource.create({
    data: {
      clientId,
      projectId,
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
      projectId,
      sourceId: source.id,
      pageId,
      pageName,
      pageToken: page.token,
      connectedById: user.id,
    },
  });

  const base = process.env.APP_BASE_URL || "https://app.apolloadv.co.il";
  return NextResponse.redirect(
    `${base}/admin/clients/${clientId}/projects/${projectId}?meta=connected`,
    { status: 303 }
  );
});
