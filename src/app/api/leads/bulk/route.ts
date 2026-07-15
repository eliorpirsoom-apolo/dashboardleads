import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { onLeadStatusChanged } from "@/lib/hooks";
import { recordActivity } from "@/lib/leadActivity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BulkAction = z.object({
  clientId: z.string().optional(),
  ids: z.array(z.string().min(1)).min(1, "לא נבחרו לידים").max(200),
  action: z.enum(["set_status", "assign", "archive", "restore"]),
  statusId: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
});

// POST /api/leads/bulk — one action on many selected leads.
// Status changes go one-by-one so the inventory/automation hooks still fire.
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = BulkAction.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  const leads = await prisma.lead.findMany({
    where: { id: { in: body.ids }, clientId },
  });
  if (leads.length === 0) throw new ApiError(404, "לא נמצאו לידים");

  if (body.action === "set_status") {
    if (!body.statusId) throw new ApiError(400, "חסר סטטוס יעד");
    const status = await prisma.leadStatus.findUnique({ where: { id: body.statusId } });
    if (!status || status.clientId !== clientId) throw new ApiError(400, "סטטוס לא תקין");
    for (const lead of leads) {
      if (lead.statusId === body.statusId) continue;
      const prev = lead.statusId
        ? await prisma.leadStatus.findUnique({ where: { id: lead.statusId } })
        : null;
      await prisma.lead.update({
        where: { id: lead.id },
        data: { statusId: body.statusId },
      });
      await recordActivity(lead.id, user.name, "status", {
        fromValue: prev?.name ?? null,
        toValue: status.name,
        note: "פעולה מרובה",
      });
      await onLeadStatusChanged(lead.id, lead.statusId, body.statusId, user.name);
    }
  } else if (body.action === "assign") {
    if (body.assigneeId) {
      const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId } });
      if (!assignee || assignee.clientId !== clientId) {
        throw new ApiError(400, "המטפל חייב להיות משתמש של הלקוח");
      }
    }
    const next = body.assigneeId
      ? await prisma.user.findUnique({ where: { id: body.assigneeId } })
      : null;
    await prisma.lead.updateMany({
      where: { id: { in: leads.map((l) => l.id) } },
      data: { assigneeId: body.assigneeId ?? null },
    });
    for (const lead of leads) {
      await recordActivity(lead.id, user.name, "assign", {
        toValue: next?.name ?? "ללא מטפל",
        note: "פעולה מרובה",
      });
    }
  } else {
    const toArchived = body.action === "archive";
    await prisma.lead.updateMany({
      where: { id: { in: leads.map((l) => l.id) } },
      data: { archived: toArchived },
    });
    for (const lead of leads) {
      await recordActivity(lead.id, user.name, toArchived ? "archive" : "restore", {
        note: "פעולה מרובה",
      });
    }
  }

  return NextResponse.json({ ok: true, affected: leads.length });
});
