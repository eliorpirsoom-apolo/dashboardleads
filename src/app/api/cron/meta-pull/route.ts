import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { metaEnabled, pullRecentLeads, findMissingLeadIds } from "@/lib/integrations/metaLeads";
import { touchCronHeartbeat, reportExternalIssue, resolveExternalIssue } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// משיכת-גיבוי של לידים מפייסבוק — כל 10 דקות, מכל העמודים המחוברים.
// האפליקציה LIVE (14.9) → מטא שולחת וובהוק בזמן אמת על לידים אמיתיים, וזה
// צינור הקליטה העיקרי; המשיכה היא רק רשת ביטחון לוובהוק שהוחמץ. הורדנו
// מ"כל דקה" ל"כל 10 דקות" (17.9) כי משיכה תכופה מדי הציפה את API ה-leadgen
// של מטא והחזירה #80005 (למשל בעמוד "קבוצת ימין ניסים") — בלי שום אובדן
// לידים. חלון 24 שעות; לידים שכבר נקלטו מדולגים בזול (externalId).
// ---------------------------------------------------------------------------

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await touchCronHeartbeat("meta-pull");
  if (!metaEnabled()) return NextResponse.json({ skipped: "meta not configured" });

  // חיבורים חדשים קודם — שאם חס וחלילה נגמר הזמן, הפעילים ביותר כבר נסרקו.
  const pages = await prisma.metaPage.findMany({
    where: { active: true, source: { active: true } },
    select: { id: true, clientId: true, pageName: true },
    orderBy: { createdAt: "desc" },
  });

  const results: Record<string, unknown> = {};
  for (const p of pages) {
    const t0 = Date.now();
    try {
      // חלון 24 שעות: מכסה גם עיכובי אינדוקס של Graph וגם ליד שנמחק בטעות
      // (ייובא מחדש) — הדילוג לפי externalId שומר על זה זול.
      const r = await pullRecentLeads(p.id, 1);
      // בקרת התאמה מהירה: כל ליד בן-זיהוי מהשעתיים האחרונות חייב להיות
      // ב-CRM אחרי המשיכה. חסר → התראה מיידית (עם dedup יומי); נקי → סגירה.
      let missing = 0;
      try {
        const gone = await findMissingLeadIds(p.clientId, r.recentIds);
        missing = gone.length;
        if (missing > 0) {
          await reportExternalIssue(
            `ext:meta-recon:${p.id}`,
            `לידים מפייסבוק לא נקלטים — ${p.pageName}`,
            `${missing} לידים מהשעתיים האחרונות קיימים אצל מטא אך לא נקלטו ב-CRM`
          );
        } else {
          await resolveExternalIssue(`ext:meta-recon:${p.id}`);
        }
      } catch (err) {
        console.error("[meta-pull:recon]", err);
      }
      results[p.pageName] = {
        forms: r.forms,
        scanned: r.scanned,
        sent: r.sent,
        recent: r.recentIds.length,
        missing,
        ms: Date.now() - t0,
        ...(r.errors.length ? { errors: r.errors.slice(0, 2) } : {}),
      };
    } catch (err) {
      results[p.pageName] = {
        error: String((err as Error)?.message ?? err).slice(0, 150),
        ms: Date.now() - t0,
      };
    }
    // נראות ב-Vercel Logs — לאבחון טיקים שקטים.
    console.log(`[meta-pull] ${p.pageName}: ${JSON.stringify(results[p.pageName])}`);
  }
  return NextResponse.json({ pages: pages.length, results });
}
