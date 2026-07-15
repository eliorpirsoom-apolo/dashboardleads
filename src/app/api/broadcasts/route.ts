import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";
import { sendMessage, renderTemplate, type Channel } from "@/lib/messaging";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/broadcasts?clientId — distribution report list.
export const GET = handle(async (req) => {
  const user = await requireUser();
  assertNotAgent(user, "צפייה בתפוצה");
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));
  const broadcasts = await prisma.broadcast.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ broadcasts });
});

const CreateBroadcast = z.object({
  clientId: z.string().optional(),
  name: z.string().min(1, "חסר שם").max(160),
  channel: z.enum(["email", "sms", "whatsapp"]),
  subject: z.string().max(200).nullable().optional(),
  body: z.string().min(1, "חסר תוכן הודעה").max(3000),
  // Lead filter for the audience:
  statusId: z.string().nullable().optional(),
  channelFilter: z.string().nullable().optional(),
  fromDate: z.string().nullable().optional(),
});

// POST /api/broadcasts — creates AND sends a broadcast to consenting leads.
// הסכמה לדיוור נאכפת כאן — לידים בלי consent לא נכללים לעולם.
export const POST = handle(async (req) => {
  const user = await requireUser();
  assertNotAgent(user);
  const body = CreateBroadcast.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  const leads = await prisma.lead.findMany({
    where: {
      clientId,
      archived: false,
      consent: true, // enforced — never message non-consenting leads
      ...(body.statusId ? { statusId: body.statusId } : {}),
      ...(body.channelFilter ? { channel: body.channelFilter } : {}),
      ...(body.fromDate ? { receivedAt: { gte: new Date(body.fromDate) } } : {}),
    },
    include: { status: true },
    take: 500,
  });

  // Filter to leads that have the needed contact info for the channel.
  const targets = leads.filter((l) =>
    body.channel === "email" ? l.email : l.phone
  );
  if (targets.length === 0) {
    throw new ApiError(
      422,
      "אין לידים תואמים עם הסכמה לדיוור ופרטי קשר מתאימים לערוץ"
    );
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      clientId,
      name: body.name,
      channel: body.channel,
      subject: body.subject ?? null,
      body: body.body,
      filterJson: JSON.stringify({
        statusId: body.statusId,
        channelFilter: body.channelFilter,
        fromDate: body.fromDate,
      }),
      total: targets.length,
      status: "running",
      createdBy: user.name,
    },
  });

  let sent = 0;
  let failed = 0;
  for (const lead of targets) {
    const res = await sendMessage({
      channel: body.channel as Channel,
      to: body.channel === "email" ? lead.email! : lead.phone!,
      subject: body.subject ?? body.name,
      body: renderTemplate(body.body, {
        name: lead.fullName ?? "",
        phone: lead.phone ?? "",
        status: lead.status?.name ?? "",
      }),
      kind: "broadcast",
      clientId,
      leadId: lead.id,
      broadcastId: broadcast.id,
    });
    if (res.status === "failed") failed++;
    else sent++;
  }

  const updated = await prisma.broadcast.update({
    where: { id: broadcast.id },
    data: { sent, failed, status: "done" },
  });

  return NextResponse.json({ broadcast: updated }, { status: 201 });
});
