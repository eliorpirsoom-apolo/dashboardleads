import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { recordActivity } from "@/lib/leadActivity";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// POST /api/unsubscribe {t} — public endpoint. Flips the lead's consent off.
export async function POST(req: Request) {
  if (!rateLimit("unsubscribe", 60, 60_000)) {
    return NextResponse.json({ error: "יותר מדי בקשות" }, { status: 429 });
  }
  let token = "";
  try {
    token = (await req.json())?.t ?? "";
  } catch {}
  const leadId = token ? verifyUnsubscribeToken(token) : null;
  if (!leadId) {
    return NextResponse.json({ error: "קישור הסרה לא תקין" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    return NextResponse.json({ error: "רשומה לא נמצאה" }, { status: 404 });
  }

  if (lead.consent) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { consent: false },
    });
    await recordActivity(leadId, "הנמען", "consent", {
      note: "הסרה עצמית מדיוור (קישור בהודעה)",
    });
  }

  return NextResponse.json({ ok: true });
}
