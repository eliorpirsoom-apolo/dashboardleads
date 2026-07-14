import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { normalizeEmail, normalizePhone } from "@/lib/leads";
import { onLeadStatusChanged } from "@/lib/hooks";

export const dynamic = "force-dynamic";

async function scopedLead(params: { id: string }) {
  const user = await requireUser();
  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) throw new ApiError(404, "ליד לא נמצא");
  scopeClientId(user, lead.clientId);
  return { user, lead };
}

// GET /api/leads/[id] — full lead card data.
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  const { lead } = await scopedLead(params);
  const full = await prisma.lead.findUnique({
    where: { id: lead.id },
    include: {
      status: true,
      campaign: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      unitType: { select: { id: true, name: true } },
      source: { select: { id: true, name: true } },
      notes: { orderBy: { createdAt: "desc" } },
      contracts: { select: { id: true, value: true, signedAt: true } },
      tasks: {
        where: { status: "open" },
        orderBy: { dueAt: "asc" },
        select: { id: true, title: true, dueAt: true, type: true },
      },
    },
  });
  const fields = await prisma.customFieldDef.findMany({
    where: { clientId: lead.clientId, active: true },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ lead: full, customFields: fields });
});

const UpdateLead = z.object({
  fullName: z.string().max(120).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().max(160).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  channel: z.string().max(40).nullable().optional(),
  platform: z.string().max(40).nullable().optional(),
  audience: z.string().max(160).nullable().optional(),
  adName: z.string().max(160).nullable().optional(),
  campaignId: z.string().nullable().optional(),
  campaignLabel: z.string().max(160).nullable().optional(),
  statusId: z.string().nullable().optional(),
  unitTypeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  consent: z.boolean().optional(),
  data: z.record(z.any()).optional(),
});

// PATCH /api/leads/[id] — edits; status changes fire the domain hooks
// (inventory automation + client automations).
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const { user, lead } = await scopedLead(params);
  const body = UpdateLead.parse(await readJson(req));

  // Validate cross-references belong to the same client.
  if (body.statusId) {
    const st = await prisma.leadStatus.findUnique({ where: { id: body.statusId } });
    if (!st || st.clientId !== lead.clientId) throw new ApiError(400, "סטטוס לא תקין");
  }
  if (body.campaignId) {
    const c = await prisma.campaign.findUnique({ where: { id: body.campaignId } });
    if (!c || c.clientId !== lead.clientId) throw new ApiError(400, "קמפיין לא תקין");
  }
  if (body.unitTypeId) {
    const u = await prisma.unitType.findUnique({
      where: { id: body.unitTypeId },
      include: { project: true },
    });
    if (!u || u.project.clientId !== lead.clientId) {
      throw new ApiError(400, "טיפוס דירה לא תקין");
    }
  }

  const prevStatusId = lead.statusId;

  // Merge custom-field data instead of overwriting blindly.
  let mergedData: string | undefined;
  if (body.data) {
    const current = lead.data ? JSON.parse(lead.data) : {};
    mergedData = JSON.stringify({ ...current, ...body.data });
  }

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      fullName: body.fullName,
      phone: body.phone === undefined ? undefined : normalizePhone(body.phone),
      email: body.email === undefined ? undefined : normalizeEmail(body.email),
      city: body.city,
      channel: body.channel,
      platform: body.platform,
      audience: body.audience,
      adName: body.adName,
      campaignId: body.campaignId,
      campaignLabel: body.campaignLabel,
      statusId: body.statusId,
      unitTypeId: body.unitTypeId,
      projectId: body.projectId,
      consent: body.consent,
      ...(mergedData !== undefined ? { data: mergedData } : {}),
    },
  });

  if (body.statusId !== undefined && body.statusId !== prevStatusId) {
    await onLeadStatusChanged(lead.id, prevStatusId, body.statusId, user.name);
  }

  return NextResponse.json({ lead: updated });
});

// DELETE — archive (never hard-delete lead history).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const { lead } = await scopedLead(params);
  await prisma.lead.update({ where: { id: lead.id }, data: { archived: true } });
  return NextResponse.json({ ok: true });
});
