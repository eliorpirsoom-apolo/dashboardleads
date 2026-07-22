import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const UpdateEngagement = z.object({
  kickoffAt: z.string().nullable().optional(), // ISO or yyyy-mm-dd
  kickoffDone: z.boolean().optional(),
  status: z.enum(["active", "done"]).optional(),
});

// PATCH /api/engagements/[id] — ישיבת התנעה / סגירת ליווי.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const body = UpdateEngagement.parse(await readJson(req));
  const existing = await prisma.engagement.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, "ליווי לא נמצא");

  const engagement = await prisma.engagement.update({
    where: { id: params.id },
    data: {
      ...(body.kickoffAt !== undefined
        ? { kickoffAt: body.kickoffAt ? new Date(body.kickoffAt) : null }
        : {}),
      kickoffDone: body.kickoffDone,
      status: body.status,
    },
  });
  return NextResponse.json({ engagement });
});
