import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError, requireAdmin } from "@/lib/api";
// פתוח לכל צוות המשרד — חיבור טפסים וניתוב לידים (החלטת הבעלים 2026-09-01).
import { processLeadgenEvent } from "@/lib/integrations/metaLeads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    select: { pageToken: true, pageName: true, clientId: true, pageId: true },
  });
  if (!page) throw new ApiError(404, "החיבור לא נמצא");

  // ניקוי עצמי: מטא מתירה ליד בדיקה אחד לטופס — מוחקים את הקודם אצל מטא בלבד.
  // הליד שנוצר ממנו ב-CRM נשאר (כל בדיקה = שורה משלה, עם חותמת זמן בשם), כדי
  // שאפשר לשלוח כמה בדיקות ברצף ולראות את כולן; המשרד מוחק אותן כשמסיים.
  let cleaned = 0;
  try {
    const prevRes = await fetch(
      `${GRAPH}/${b.formId}/test_leads?fields=id&access_token=${encodeURIComponent(page.pageToken)}`,
      { cache: "no-store" }
    );
    const prev = await prevRes.json();
    for (const t of prev?.data ?? []) {
      const del = await fetch(`${GRAPH}/${t.id}?access_token=${encodeURIComponent(page.pageToken)}`, {
        method: "DELETE",
      }).catch(() => null);
      if (del?.ok) cleaned++;
    }
  } catch {
    /* ניקוי הוא best-effort — יצירה חדשה תדווח אם עדיין חסום */
  }
  const stamp = new Date().toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // ערכי דמה לפי שאלות הטופס: בלי field_data מטא יוצרת ליד ריק (בלי שם/טלפון)
  // שהקליטה מדלגת עליו בכוונה — ליד בדיקה חייב זהות כדי לבדוק את הצינור באמת.
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  let fieldData: { name: string; values: string[] }[] = [];
  try {
    const qRes = await fetch(
      `${GRAPH}/${b.formId}?fields=questions&access_token=${encodeURIComponent(page.pageToken)}`,
      { cache: "no-store" }
    );
    const qData = await qRes.json();
    fieldData = (qData?.questions ?? [])
      .map((q: any) => {
        const key = String(q.key ?? "");
        const type = String(q.type ?? "").toUpperCase();
        let v = "בדיקה";
        if (Array.isArray(q.options) && q.options.length) v = String(q.options[0]?.value ?? q.options[0]?.key ?? "בדיקה");
        else if (type.includes("PHONE") || /phone|טלפון|נייד/i.test(key)) v = `050000${rand}`;
        else if (type.includes("EMAIL") || /mail|מייל/i.test(key)) v = `test.${rand}@apolloadv.co.il`;
        else if (type.includes("NAME") || /name|שם/i.test(key)) v = `ליד בדיקה — Apollo CRM ${stamp}`;
        else if (/city|עיר/i.test(key)) v = "בדיקת מערכת";
        return { name: key, values: [v] };
      })
      .filter((f: { name: string }) => f.name);
  } catch {
    /* בלי שאלות — ניצור ליד ריק; delivered=false יסמן שהקליטה דילגה */
  }

  const res = await fetch(`${GRAPH}/${b.formId}/test_leads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: page.pageToken,
      ...(fieldData.length ? { field_data: JSON.stringify(fieldData) } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.id) {
    const msg = String(data?.error?.message ?? JSON.stringify(data).slice(0, 200));
    throw new ApiError(
      400,
      /already|exist/i.test(msg)
        ? "מטא מתירה ליד בדיקה אחד לטופס, וקיים ליד בדיקה שנוצר מחוץ ל-CRM (למשל בכלי הבדיקה של מטא) שאין לנו הרשאה למחוק — מחקו אותו בכלי: developers.facebook.com/tools/lead-ads-testing ואז שלחו שוב"
        : `יצירת ליד בדיקה נכשלה: ${msg.slice(0, 200)}`
    );
  }

  // הזרמה מיידית לקליטה — הוובהוק של מטא לא אמין במצב פיתוח, והמשיכה
  // המחזורית רצה רק כל כמה דקות; ככה הבדיקה מקצה-לקצה מסתיימת בלחיצה אחת.
  const delivery = await processLeadgenEvent(page.pageId, String(data.id));
  const created = delivery.ok
    ? await prisma.lead.findFirst({
        where: { clientId: page.clientId, externalId: String(data.id) },
        select: { number: true, project: { select: { name: true } } },
      })
    : null;
  return NextResponse.json({
    ok: true,
    leadgenId: String(data.id),
    cleanedPrevious: cleaned,
    fields: fieldData.map((f) => f.name),
    delivered: delivery.ok,
    deliveryNote: delivery.ok ? null : delivery.note,
    leadNumber: created?.number ?? null,
    projectName: created?.project?.name ?? null,
  });
});
