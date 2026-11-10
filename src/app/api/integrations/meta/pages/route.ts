import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { metaEnabled, metaVerifyToken, syncPageSubscription } from "@/lib/integrations/metaLeads";
import {
  SOCIAL_ACCOUNT_PUBLIC,
  disconnectSocialAccount,
  refreshInstagramLink,
} from "@/lib/social/accounts";

export const dynamic = "force-dynamic";

// GET /api/integrations/meta/pages?clientId= — העמודים המחוברים של הלקוח
// (?projectId= נתמך לתאימות לאחור) + פרטי ההגדרה למנהל (וובהוק לקונסולת Meta).
// ?purpose=social — הדפים המחוברים לתיבת המענה החברתי (בלי טוקנים).
export const GET = handle(async (req) => {
  const user = await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const clientId = sp.get("clientId");
  const projectId = sp.get("projectId");
  if (!clientId && !projectId) throw new ApiError(400, "חסר clientId");

  if (sp.get("purpose") === "social") {
    if (!clientId) throw new ApiError(400, "חסר clientId");
    const accounts = await prisma.socialAccount.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      select: SOCIAL_ACCOUNT_PUBLIC,
    });
    return NextResponse.json({ enabled: metaEnabled(), accounts });
  }

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

// POST /api/integrations/meta/pages?purpose=social&id=&action=refresh-ig —
// רענון הקישור לאינסטגרם של דף מחובר לתיבה (קריאה בלבד ל-Graph, בלי חיבור מחדש).
export const POST = handle(async (req) => {
  await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  if (!id) throw new ApiError(400, "חסר id");
  if (sp.get("purpose") !== "social" || sp.get("action") !== "refresh-ig") {
    throw new ApiError(400, "פעולה לא מוכרת");
  }
  const r = await refreshInstagramLink(id);
  return NextResponse.json({ ok: true, ...r });
});

// DELETE /api/integrations/meta/pages?id= — ניתוק עמוד (מנהל בלבד).
// המקור נשאר עם הלידים ההיסטוריים — רק מכובה.
// ?purpose=social&id= — ניתוק מתיבת המענה (הרשומה מכובה, השרשורים נשארים).
export const DELETE = handle(async (req) => {
  await requireManager();
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  if (!id) throw new ApiError(400, "חסר id");

  if (sp.get("purpose") === "social") {
    await disconnectSocialAccount(id);
    return NextResponse.json({ ok: true });
  }

  const page = await prisma.metaPage.findUnique({ where: { id } });
  if (!page) throw new ApiError(404, "עמוד לא נמצא");

  // סנכרון הרישום בלי leadgen — שדות תיבת המענה (אם הדף מחובר אליה) נשארים.
  // כשל ב-Graph לא חוסם את הניתוק.
  await syncPageSubscription(page.pageId, page.pageToken, { leads: false }).catch((err) => {
    console.error("[meta disconnect] subscription sync failed", page.pageId, String(err).slice(0, 200));
  });
  await prisma.$transaction([
    prisma.leadSource.update({ where: { id: page.sourceId }, data: { active: false } }),
    prisma.metaPage.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
});
