import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { metaEnabled, metaVerifyToken, unsubscribePage } from "@/lib/integrations/metaLeads";

export const dynamic = "force-dynamic";

// GET /api/integrations/meta/pages?clientId= — העמודים המחוברים של הלקוח
// (?projectId= נתמך לתאימות לאחור) + פרטי ההגדרה למנהל (וובהוק לקונסולת Meta).
export const GET = handle(async (req) => {
  const user = await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const clientId = sp.get("clientId");
  const projectId = sp.get("projectId");
  if (!clientId && !projectId) throw new ApiError(400, "חסר clientId");
  const pages = await prisma.metaPage.findMany({
    where: clientId ? { clientId } : { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      pageId: true,
      pageName: true,
      active: true,
      lastLeadAt: true,
      lastError: true,
      createdAt: true,
      projectId: true,
      project: { select: { name: true } },
      source: { select: { name: true, _count: { select: { leads: true } } } },
    },
  });
  const isManager = user.adminRole !== "staff"; // כמו isManager בהרשאות
  const base = process.env.APP_BASE_URL || "https://app.apolloadv.co.il";
  return NextResponse.json({
    enabled: metaEnabled(),
    pages,
    ...(isManager
      ? {
          setup: {
            webhookUrl: `${base}/api/webhooks/meta`,
            verifyToken: metaVerifyToken(),
          },
        }
      : {}),
  });
});

// DELETE /api/integrations/meta/pages?id= — ניתוק עמוד (מנהל בלבד).
// המקור נשאר עם הלידים ההיסטוריים — רק מכובה.
export const DELETE = handle(async (req) => {
  await requireManager();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ApiError(400, "חסר id");
  const page = await prisma.metaPage.findUnique({ where: { id } });
  if (!page) throw new ApiError(404, "עמוד לא נמצא");

  await unsubscribePage(page.pageId, page.pageToken);
  await prisma.$transaction([
    prisma.leadSource.update({ where: { id: page.sourceId }, data: { active: false } }),
    prisma.metaPage.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
});
