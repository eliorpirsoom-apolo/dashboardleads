import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/broadcasts/preview — "כמה נמענים?" לפני שליחה.
// אותם פילטרים בדיוק כמו השליחה עצמה, כולל אכיפת הסכמה לדיוור.
export const GET = handle(async (req) => {
  const user = await requireUser();
  assertNotAgent(user, "תפוצה");
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));
  const channel = p.get("channel") ?? "email";

  const leads = await prisma.lead.findMany({
    where: {
      clientId,
      archived: false,
      consent: true,
      ...(p.get("statusId") ? { statusId: p.get("statusId")! } : {}),
      ...(p.get("channelFilter") ? { channel: p.get("channelFilter")! } : {}),
      ...(p.get("fromDate")
        ? { receivedAt: { gte: new Date(p.get("fromDate")!) } }
        : {}),
    },
    select: { email: true, phone: true },
    take: 501,
  });

  const count = leads.filter((l) =>
    channel === "email" ? l.email : l.phone
  ).length;

  return NextResponse.json({ count, capped: leads.length > 500 });
});
