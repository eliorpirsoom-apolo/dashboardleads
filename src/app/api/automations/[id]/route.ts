import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const UpdateAutomation = z.object({
  name: z.string().min(1).max(120).optional(),
  template: z.string().min(1).max(2000).optional(),
  channel: z.enum(["email", "sms", "whatsapp"]).optional(),
  recipientType: z.enum(["client_users", "agents", "assignee", "custom"]).optional(),
  customRecipients: z.array(z.string().min(1)).max(20).optional(),
  active: z.boolean().optional(),
});

export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  assertNotAgent(user);
  const existing = await prisma.automation.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "אוטומציה לא נמצאה");
  scopeClientId(user, existing.clientId);

  const body = UpdateAutomation.parse(await readJson(req));
  const automation = await prisma.automation.update({
    where: { id: params.id },
    data: {
      ...body,
      customRecipients: body.customRecipients
        ? JSON.stringify(body.customRecipients)
        : undefined,
    },
  });
  return NextResponse.json({ automation });
});

export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  assertNotAgent(user);
  const existing = await prisma.automation.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "אוטומציה לא נמצאה");
  scopeClientId(user, existing.clientId);
  await prisma.automation.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
