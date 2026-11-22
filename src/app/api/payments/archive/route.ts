import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";

export const dynamic = "force-dynamic";

async function guard() {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "payments")) throw new ApiError(403, "אין הרשאה למודול התשלומים");
}

const Body = z.object({
  clientId: z.string().min(1),
  archived: z.boolean(),
});

// POST /api/payments/archive — move a client to / from the payments-board archive.
// Scoped to the payments board ONLY: it sets Client.paymentsArchivedAt and does
// NOT touch `active` (login) or any other module. Reversible.
export const POST = handle(async (req) => {
  await guard();
  const b = Body.parse(await readJson(req));

  const client = await prisma.client.update({
    where: { id: b.clientId },
    data: { paymentsArchivedAt: b.archived ? new Date() : null },
    select: { id: true, paymentsArchivedAt: true },
  });

  return NextResponse.json({ client });
});
