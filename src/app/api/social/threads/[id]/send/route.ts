import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, ApiError } from "@/lib/api";
import { requireSocialAccess } from "@/lib/social/access";
import { sendSocialReply, SEND_MAX_CHARS } from "@/lib/social/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ text: z.string().min(1).max(SEND_MAX_CHARS + 200) });

// POST /api/social/threads/:id/send {text} — שליחת תשובה אחרי אישור אדם (שלב 1c).
// הטקסט שנשלח הוא מה שהמשתמש אישר/ערך בתיבה, לא הטיוטה הגולמית.
// כשל Meta/הגנה חוזר כ-409 עם הסבר (לא 500), כדי שהתיבה תציג אותו כמו שהוא.
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireSocialAccess();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "חסר טקסט לשליחה");
  const r = await sendSocialReply({
    threadId: params.id,
    text: parsed.data.text,
    userId: user.id,
    userName: user.name ?? null,
  });
  if (!r.ok) {
    if (r.code === "not_found") throw new ApiError(404, r.message);
    if (r.code === "disabled") throw new ApiError(503, r.message);
    throw new ApiError(409, r.message);
  }
  return NextResponse.json({ ok: true, messageId: r.messageId, externalId: r.externalId });
});
