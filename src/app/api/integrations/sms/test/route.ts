import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, ApiError, readJson } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { sendMessage, smsConfigured } from "@/lib/messaging";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TestSms = z.object({
  to: z.string().min(9, "מספר טלפון לא תקין").max(20),
});

// POST /api/integrations/sms/test — שליחת SMS בדיקה למספר שנמסר. מנהל בלבד.
export const POST = handle(async (req) => {
  await requireManager();
  if (!smsConfigured()) throw new ApiError(400, "SMS לא מוגדר (חסרים משתני סביבה)");
  const { to } = TestSms.parse(await readJson(req));

  const res = await sendMessage({
    channel: "sms",
    to,
    body: "בדיקת מערכת — Apollo CRM. אם קיבלת הודעה זו, חיבור ה-SMS פעיל ✓",
    kind: "system",
  });

  if (res.status === "failed") {
    throw new ApiError(502, "שליחת ה-SMS נכשלה — ראה יומן ההודעות לפרטים");
  }
  return NextResponse.json({ ok: true, status: res.status, messageId: res.id });
});

// GET — סטטוס מהיר (האם מוגדר).
export const GET = handle(async () => {
  await requireManager();
  return NextResponse.json({ configured: smsConfigured() });
});
