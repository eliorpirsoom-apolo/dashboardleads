import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson } from "@/lib/api";
import { createLeadNumbered, defaultStatusId, normalizeEmail, normalizePhone } from "@/lib/leads";
import { buildLeadWhere } from "@/lib/leadFilters";
import { onLeadCreated } from "@/lib/hooks";
import { recordActivity } from "@/lib/leadActivity";
import { allowedProjectIds } from "@/lib/projectScope";

export const dynamic = "force-dynamic";

// GET /api/leads?clientId&statusId&channel&q&from&to&page — filtered table.
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));

  const page = Math.max(1, Number(p.get("page") || 1));
  const pageSize = Math.min(200, Math.max(10, Number(p.get("pageSize") || 20)));
  const where = buildLeadWhere(clientId, p, user.id, await allowedProjectIds(user));

  const [total, rows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        status: { select: { id: true, name: true, color: true, systemKind: true } },
        campaign: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        unitType: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        _count: { select: { notes: true } },
      },
    }),
  ]);

  return NextResponse.json({ rows, total, page, pageSize });
});

const CreateLead = z.object({
  clientId: z.string().optional(),
  fullName: z.string().max(120).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().max(160).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  channel: z.string().max(40).optional().nullable(),
  platform: z.string().max(40).optional().nullable(),
  campaignId: z.string().optional().nullable(),
  campaignLabel: z.string().max(160).optional().nullable(),
  audience: z.string().max(160).optional().nullable(),
  adName: z.string().max(160).optional().nullable(),
  consent: z.boolean().default(false),
  kind: z.enum(["form", "call", "whatsapp", "manual"]).default("manual"),
  projectId: z.string().optional().nullable(),
  data: z.record(z.any()).optional(),
});

// POST /api/leads — manual lead creation from the UI.
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = CreateLead.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  // פרויקט: חייב להשתייך לאותו לקוח; סוכן-פרויקטים מוגבל לפרויקטים שלו
  // (וליד ידני שלו נכנס לפרויקט הראשון שלו אם לא נבחר אחרת).
  const allowed = await allowedProjectIds(user);
  let projectId = body.projectId || null;
  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.clientId !== clientId) projectId = null;
  }
  if (allowed) {
    if (!projectId || !allowed.includes(projectId)) projectId = allowed[0];
  }

  const lead = await createLeadNumbered({
    clientId,
    projectId,
    kind: body.kind,
    statusId: await defaultStatusId(clientId),
    assigneeId: user.role === "CLIENT" && user.isAgent ? user.id : null,
    fullName: body.fullName || null,
    phone: normalizePhone(body.phone),
    email: normalizeEmail(body.email),
    city: body.city || null,
    channel: body.channel || null,
    platform: body.platform || null,
    campaignId: body.campaignId || null,
    campaignLabel: body.campaignLabel || null,
    audience: body.audience || null,
    adName: body.adName || null,
    consent: body.consent,
    receivedAt: new Date(),
    data: body.data ? JSON.stringify(body.data) : null,
  });

  await recordActivity(lead.id, user.name, "create", { note: "נוצר ידנית" });
  await onLeadCreated(lead.id);
  return NextResponse.json({ lead }, { status: 201 });
});
