import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, ApiError, readJson } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { sendMessage, whatsappConfigured } from "@/lib/messaging";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TestWa = z.object({ to: z.string().min(9, "מספר לא תקין").max(20) });

// POST /api/integrations/whatsapp/test — שליחת וואטסאפ בדיקה. מנהל בלבד.
export const POST = handle(async (req) => {
  await requireManager();
  if (!whatsappConfigured()) throw new ApiError(400, "וואטסאפ לא מוגדר (Green API)");
  const { to } = TestWa.parse(await readJson(req));
  const res = await sendMessage({
    channel: "whatsapp",
    to,
    body: "בדיקת מערכת — Apollo CRM. אם קיבלת הודעה זו, חיבור הוואטסאפ פעיל ✓",
    kind: "system",
  });
  if (res.status === "failed") {
    throw new ApiError(502, "שליחת הוואטסאפ נכשלה — ראה יומן ההודעות לפרטים");
  }
  return NextResponse.json({ ok: true, status: res.status, messageId: res.id });
});

// GET — סטטוס מהיר.
export const GET = handle(async () => {
  await requireManager();
  return NextResponse.json({ configured: whatsappConfigured() });
});
