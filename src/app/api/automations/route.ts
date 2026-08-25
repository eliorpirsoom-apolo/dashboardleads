import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/automations?clientId
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));
  const automations = await prisma.automation.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
    include: { status: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json({ automations });
});

const CreateAutomation = z.object({
  clientId: z.string().optional(),
  name: z.string().min(1, "חסר שם").max(120),
  trigger: z.enum(["lead_created", "status_changed"]),
  statusId: z.string().nullable().optional(),
  channel: z.enum(["email", "sms", "whatsapp"]),
  recipientType: z.enum(["client_users", "agents", "assignee", "custom", "lead"]),
  customRecipients: z.array(z.string().min(1)).max(20).optional(),
  template: z.string().min(1, "חסרה תבנית הודעה").max(2000),
  leadKind: z.enum(["call", "form"]).nullable().optional(),
  mediaKey: z.string().max(400).nullable().optional(),
  mediaName: z.string().max(200).nullable().optional(),
  mediaMime: z.string().max(100).nullable().optional(),
  cooldownHours: z.number().int().min(1).max(720).nullable().optional(),
});

// POST /api/automations — e.g. "ליד חדש ⟵ וואטסאפ לסוכנים".
export const POST = handle(async (req) => {
  const user = await requireUser();
  assertNotAgent(user);
  const body = CreateAutomation.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  if (body.trigger === "status_changed") {
    if (!body.statusId) throw new ApiError(400, "בחרו סטטוס שמפעיל את האוטומציה");
    const st = await prisma.leadStatus.findUnique({ where: { id: body.statusId } });
    if (!st || st.clientId !== clientId) throw new ApiError(400, "סטטוס לא תקין");
  }
  if (body.mediaKey && body.channel !== "whatsapp") {
    throw new ApiError(400, "צירוף מדיה נתמך רק בערוץ וואטסאפ");
  }
  // מדיה שהועלתה חייבת לשבת בתיקיית הלקוח באחסון (מפתח ה-presign כולל אותה).
  if (body.mediaKey && !body.mediaKey.includes(clientId)) {
    throw new ApiError(403, "קובץ מדיה לא מורשה");
  }

  const automation = await prisma.automation.create({
    data: {
      clientId,
      name: body.name,
      trigger: body.trigger,
      statusId: body.trigger === "status_changed" ? body.statusId : null,
      channel: body.channel,
      recipientType: body.recipientType,
      customRecipients: body.customRecipients
        ? JSON.stringify(body.customRecipients)
        : null,
      template: body.template,
      leadKind: body.trigger === "lead_created" ? body.leadKind ?? null : null,
      mediaKey: body.mediaKey ?? null,
      mediaName: body.mediaName ?? null,
      mediaMime: body.mediaMime ?? null,
      cooldownHours: body.cooldownHours ?? null,
    },
  });
  return NextResponse.json({ automation }, { status: 201 });
});
