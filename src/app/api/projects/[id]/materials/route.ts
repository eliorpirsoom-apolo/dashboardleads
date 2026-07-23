import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";
import { sendMaterialsRequest, parseItems } from "@/lib/materials";

export const dynamic = "force-dynamic";

async function scopedProject(id: string) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new ApiError(404, "פרויקט לא נמצא");
  scopeClientId(user, project.clientId);
  return { user, project };
}

// GET /api/projects/[id]/materials — הרשימה + סטטוס הבקשה.
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  const { project } = await scopedProject(params.id);
  const materials = await prisma.projectMaterial.findMany({
    where: { projectId: project.id },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({
    materials,
    requestedAt: project.materialsRequestedAt,
    received: project.materialsReceived,
    remindersSent: project.materialsRemindersSent,
    lastRemindedAt: project.materialsLastRemindedAt,
  });
});

const Action = z.object({
  action: z.enum(["send", "toggleReceived", "toggleItem", "addItem", "applyTemplate"]),
  itemId: z.string().optional(),
  label: z.string().max(300).optional(),
  received: z.boolean().optional(),
  templateId: z.string().optional(),
});

// POST /api/projects/[id]/materials — פעולות: שליחה, סימון התקבל, פריט, תבנית.
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const { user, project } = await scopedProject(params.id);
  assertNotAgent(user);
  const body = Action.parse(await readJson(req));

  if (body.action === "send") {
    const isReminder = Boolean(project.materialsRequestedAt);
    const sent = await sendMaterialsRequest(project.id, isReminder);
    return NextResponse.json({ ok: true, sent, reminder: isReminder });
  }

  if (body.action === "toggleReceived") {
    const received = body.received ?? !project.materialsReceived;
    await prisma.project.update({
      where: { id: project.id },
      data: { materialsReceived: received, materialsReceivedAt: received ? new Date() : null },
    });
    return NextResponse.json({ ok: true, received });
  }

  if (body.action === "toggleItem") {
    if (!body.itemId) throw new ApiError(400, "חסר פריט");
    const item = await prisma.projectMaterial.findUnique({ where: { id: body.itemId } });
    if (!item || item.projectId !== project.id) throw new ApiError(404, "פריט לא נמצא");
    await prisma.projectMaterial.update({
      where: { id: body.itemId },
      data: { received: body.received ?? !item.received },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "addItem") {
    if (!body.label?.trim()) throw new ApiError(400, "חסר טקסט");
    const count = await prisma.projectMaterial.count({ where: { projectId: project.id } });
    const material = await prisma.projectMaterial.create({
      data: { projectId: project.id, label: body.label.trim(), order: count },
    });
    return NextResponse.json({ material }, { status: 201 });
  }

  if (body.action === "applyTemplate") {
    if (!body.templateId) throw new ApiError(400, "חסרה תבנית");
    const tpl = await prisma.materialTemplate.findUnique({ where: { id: body.templateId } });
    if (!tpl) throw new ApiError(404, "תבנית לא נמצאה");
    const existing = await prisma.projectMaterial.count({ where: { projectId: project.id } });
    const items = parseItems(tpl.items);
    await prisma.projectMaterial.createMany({
      data: items.map((label, i) => ({ projectId: project.id, label, order: existing + i })),
    });
    return NextResponse.json({ ok: true, added: items.length });
  }

  throw new ApiError(400, "פעולה לא מוכרת");
});

// DELETE /api/projects/[id]/materials?itemId=x — הסרת פריט.
export const DELETE = handle(async (req, { params }: { params: { id: string } }) => {
  const { user, project } = await scopedProject(params.id);
  assertNotAgent(user);
  const itemId = new URL(req.url).searchParams.get("itemId");
  if (!itemId) throw new ApiError(400, "חסר פריט");
  await prisma.projectMaterial.deleteMany({ where: { id: itemId, projectId: project.id } });
  return NextResponse.json({ ok: true });
});
