import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { metaEnabled, pullRecentLeads } from "@/lib/integrations/metaLeads";
import { touchCronHeartbeat } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// משיכת-גיבוי של לידים מפייסבוק — כל 5 דקות, מכל העמודים המחוברים.
// כל עוד האפליקציה ב-Development mode, מטא לא שולחת וובהוק על לידים אמיתיים
// (רק על לידי בדיקה) — אז המשיכה הזו היא צינור הקליטה בפועל. גם אחרי
// App Review היא נשארת כגיבוי לוובהוק. חלון 6 שעות; לידים שכבר נקלטו
// מדולגים בזול (externalId) והקליטה עצמה מסננת כפילויות ממילא.
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
    select: { id: true, pageName: true },
    orderBy: { createdAt: "desc" },
  });

  const results: Record<string, unknown> = {};
  for (const p of pages) {
    const t0 = Date.now();
    try {
      // חלון 24 שעות: מכסה גם עיכובי אינדוקס של Graph וגם ליד שנמחק בטעות
      // (ייובא מחדש) — הדילוג לפי externalId שומר על זה זול.
      const r = await pullRecentLeads(p.id, 1);
      results[p.pageName] = {
        forms: r.forms,
        scanned: r.scanned,
        sent: r.sent,
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
