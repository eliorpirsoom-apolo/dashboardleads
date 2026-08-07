import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { allowedProjectIds, projectAllowed } from "@/lib/projectScope";
import { sendWhatsappRaw, whatsappConfigured, clientWaCreds } from "@/lib/whatsapp";
import { markLeadHandled } from "@/lib/leadActivity";
import { getTaskAgentConfig } from "@/lib/taskAgent";

export const dynamic = "force-dynamic";

// שיחת וואטסאפ מול הליד — מכרטיס הליד. משווק ניגש רק ללידים של הפרויקטים שלו.
async function scopedLead(id: string) {
  const user = await requireUser();
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) throw new ApiError(404, "ליד לא נמצא");
  scopeClientId(user, lead.clientId);
  const allowed = await allowedProjectIds(user);
  if (!projectAllowed(allowed, lead.projectId)) {
    throw new ApiError(403, "הליד לא שייך לפרויקטים שלך");
  }
  return { user, lead };
}

// GET /api/leads/[id]/whatsapp — שרשור השיחה (עד 200 הודעות, מהישן לחדש).
// enabled=false → הפיצ'ר כבוי בהגדרות המשרד והפאנל לא מוצג.
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  const { lead } = await scopedLead(params.id);
  const cfg = await getTaskAgentConfig();
  if (!cfg.leadChatEnabled) {
    return NextResponse.json({ enabled: false, messages: [], configured: false, phone: lead.phone });
  }
  const messages = await prisma.whatsappMessage.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true, direction: true, body: true, authorName: true,
      mediaUrl: true, mediaName: true, createdAt: true,
    },
  });
  const hasClientInstance = Boolean(await clientWaCreds(lead.clientId));
  return NextResponse.json({
    enabled: true,
    messages,
    configured: hasClientInstance || whatsappConfigured(),
    phone: lead.phone,
  });
});

const SendBody = z.object({ body: z.string().min(1, "הודעה ריקה").max(4000) });

// POST /api/leads/[id]/whatsapp — שליחת הודעה לליד (נחשב טיפול בליד).
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const { user, lead } = await scopedLead(params.id);
  const cfg = await getTaskAgentConfig();
  if (!cfg.leadChatEnabled) throw new ApiError(400, "שיחות וואטסאפ עם לידים כבויות בהגדרות המערכת");
  if (!lead.phone) throw new ApiError(400, "לליד אין מספר טלפון");
  const b = SendBody.parse(await readJson(req));

  // מספר ייעודי של הלקוח אם חובר; אחרת המספר של הסוכנות.
  const creds = await clientWaCreds(lead.clientId);
  if (!creds && !whatsappConfigured()) throw new ApiError(400, "וואטסאפ אינו מוגדר");

  const r = await sendWhatsappRaw(lead.phone, b.body, creds);
  if (!r.ok) throw new ApiError(502, r.error || "השליחה נכשלה");

  const message = await prisma.whatsappMessage.create({
    data: {
      clientId: lead.clientId,
      leadId: lead.id,
      direction: "out",
      body: b.body,
      authorName: user.name,
      waMessageId: r.idMessage || null,
    },
    select: {
      id: true, direction: true, body: true, authorName: true,
      mediaUrl: true, mediaName: true, createdAt: true,
    },
  });
  // שליחת הודעה לליד = טיפול (Speed-to-Lead).
  await markLeadHandled(lead.id);
  return NextResponse.json({ message }, { status: 201 });
});
