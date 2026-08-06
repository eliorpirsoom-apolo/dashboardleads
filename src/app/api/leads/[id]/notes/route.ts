import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { markLeadHandled } from "@/lib/leadActivity";

export const dynamic = "force-dynamic";

const CreateNote = z.object({
  body: z.string().min(1, "הערה ריקה").max(4000),
});

// POST /api/leads/[id]/notes — add to the lead's notes timeline.
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) throw new ApiError(404, "ליד לא נמצא");
  scopeClientId(user, lead.clientId);

  const body = CreateNote.parse(await readJson(req));
  const note = await prisma.leadNote.create({
    data: {
      leadId: lead.id,
      userId: user.id,
      authorName: user.name,
      body: body.body,
    },
  });
  // Speed-to-Lead: הערה = הליד טופל.
  await markLeadHandled(lead.id);
  return NextResponse.json({ note }, { status: 201 });
});
