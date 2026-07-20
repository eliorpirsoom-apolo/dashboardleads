import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { normalizeEmail, normalizePhone } from "@/lib/leads";
import { onLeadStatusChanged } from "@/lib/hooks";
import { recordActivity } from "@/lib/leadActivity";
import { allowedProjectIds, projectAllowed } from "@/lib/projectScope";

export const dynamic = "force-dynamic";

async function scopedLead(params: { id: string }) {
  const user = await requireUser();
  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) throw new ApiError(404, "ליד לא נמצא");
  scopeClientId(user, lead.clientId);
  // סוכן-פרויקטים נוגע רק בלידים של הפרויקטים שלו.
  const allowed = await allowedProjectIds(user);
  if (!projectAllowed(allowed, lead.projectId)) {
    throw new ApiError(403, "הליד לא שייך לפרויקטים שלך");
  }
  return { user, lead, allowed };
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
      assignee: { select: { id: true, name: true } },
      notes: { orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 50 },
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
  // Duplicate signal: other non-archived leads sharing phone or email.
  const dupWhere = [];
  if (lead.phone) dupWhere.push({ phone: lead.phone });
  if (lead.email) dupWhere.push({ email: lead.email });
  const duplicates =
    dupWhere.length > 0
      ? await prisma.lead.findMany({
          where: {
            clientId: lead.clientId,
            archived: false,
            id: { not: lead.id },
            OR: dupWhere,
          },
          select: { id: true, number: true, fullName: true, receivedAt: true },
          take: 5,
        })
      : [];
  return NextResponse.json({ lead: full, customFields: fields, duplicates });
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
  assigneeId: z.string().nullable().optional(),
  consent: z.boolean().optional(),
  archived: z.boolean().optional(), // restore from archive
  data: z.record(z.any()).optional(),
});

// PATCH /api/leads/[id] — edits; status changes fire the domain hooks
// (inventory automation + client automations).
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const { user, lead, allowed } = await scopedLead(params);
  const body = UpdateLead.parse(await readJson(req));

  // Validate cross-references belong to the same client.
  if (body.projectId) {
    const proj = await prisma.project.findUnique({ where: { id: body.projectId } });
    if (!proj || proj.clientId !== lead.clientId) throw new ApiError(400, "פרויקט לא תקין");
    if (!projectAllowed(allowed, body.projectId)) {
      throw new ApiError(403, "אין גישה לפרויקט הזה");
    }
  } else if (body.projectId === null && allowed) {
    throw new ApiError(403, "סוכן לא יכול להוציא ליד מהפרויקט");
  }
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
  if (body.assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId } });
    if (!assignee || assignee.clientId !== lead.clientId) {
      throw new ApiError(400, "המטפל חייב להיות משתמש של הלקוח");
    }
  }

  const prevStatusId = lead.statusId;
  const prevAssigneeId = lead.assigneeId;

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
      assigneeId: body.assigneeId,
      consent: body.consent,
      archived: body.archived,
      ...(mergedData !== undefined ? { data: mergedData } : {}),
    },
  });

  // --- Activity trail -------------------------------------------------------
  if (body.statusId !== undefined && body.statusId !== prevStatusId) {
    const [prev, next] = await Promise.all([
      prevStatusId ? prisma.leadStatus.findUnique({ where: { id: prevStatusId } }) : null,
      body.statusId ? prisma.leadStatus.findUnique({ where: { id: body.statusId } }) : null,
    ]);
    await recordActivity(lead.id, user.name, "status", {
      fromValue: prev?.name ?? null,
      toValue: next?.name ?? null,
    });
    await onLeadStatusChanged(lead.id, prevStatusId, body.statusId, user.name);
  }
  if (body.assigneeId !== undefined && body.assigneeId !== prevAssigneeId) {
    const [prev, next] = await Promise.all([
      prevAssigneeId ? prisma.user.findUnique({ where: { id: prevAssigneeId } }) : null,
      body.assigneeId ? prisma.user.findUnique({ where: { id: body.assigneeId } }) : null,
    ]);
    await recordActivity(lead.id, user.name, "assign", {
      fromValue: prev?.name ?? null,
      toValue: next?.name ?? "ללא מטפל",
    });
  }
  if (body.projectId !== undefined && body.projectId !== lead.projectId) {
    const [prevProj, nextProj] = await Promise.all([
      lead.projectId ? prisma.project.findUnique({ where: { id: lead.projectId } }) : null,
      body.projectId ? prisma.project.findUnique({ where: { id: body.projectId } }) : null,
    ]);
    await recordActivity(lead.id, user.name, "project", {
      fromValue: prevProj?.name ?? null,
      toValue: nextProj?.name ?? "ללא פרויקט",
    });
  }
  if (body.archived === false && lead.archived) {
    await recordActivity(lead.id, user.name, "restore");
  }

  return NextResponse.json({ lead: updated });
});

// DELETE — archive (never hard-delete lead history).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const { user, lead } = await scopedLead(params);
  await prisma.lead.update({ where: { id: lead.id }, data: { archived: true } });
  await recordActivity(lead.id, user.name, "archive");
  return NextResponse.json({ ok: true });
});
