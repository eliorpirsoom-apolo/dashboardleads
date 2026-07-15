import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { recordActivity } from "@/lib/leadActivity";

export const dynamic = "force-dynamic";

const MergeReq = z.object({
  otherId: z.string().min(1),
});

// POST /api/leads/[id]/merge — merge a duplicate INTO this lead:
// notes, activities and open tasks move here; the duplicate is archived.
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const body = MergeReq.parse(await readJson(req));
  if (body.otherId === params.id) throw new ApiError(400, "אי אפשר למזג ליד עם עצמו");

  const [target, other] = await Promise.all([
    prisma.lead.findUnique({ where: { id: params.id } }),
    prisma.lead.findUnique({ where: { id: body.otherId } }),
  ]);
  if (!target || !other) throw new ApiError(404, "ליד לא נמצא");
  scopeClientId(user, target.clientId);
  if (other.clientId !== target.clientId) throw new ApiError(400, "לידים של לקוחות שונים");

  await prisma.$transaction([
    prisma.leadNote.updateMany({
      where: { leadId: other.id },
      data: { leadId: target.id },
    }),
    prisma.leadActivity.updateMany({
      where: { leadId: other.id },
      data: { leadId: target.id },
    }),
    prisma.task.updateMany({
      where: { leadId: other.id, status: "open" },
      data: { leadId: target.id },
    }),
    // Fill missing contact fields from the duplicate.
    prisma.lead.update({
      where: { id: target.id },
      data: {
        email: target.email ?? other.email,
        phone: target.phone ?? other.phone,
        city: target.city ?? other.city,
        fullName: target.fullName ?? other.fullName,
      },
    }),
    prisma.lead.update({
      where: { id: other.id },
      data: { archived: true },
    }),
  ]);

  await recordActivity(target.id, user.name, "merge", {
    note: `מוזג ליד #${other.number} (${other.fullName ?? other.phone ?? ""})`,
  });
  await recordActivity(other.id, user.name, "archive", {
    note: `מוזג לתוך ליד #${target.number}`,
  });

  return NextResponse.json({ ok: true });
});
