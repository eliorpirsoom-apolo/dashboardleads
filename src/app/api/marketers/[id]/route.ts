import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { requireClientOwner, reconcileProjects } from "@/lib/marketers";

export const dynamic = "force-dynamic";

// מוודא שהמשווק שייך ללקוח של הבעלים.
async function ownedMarketer(id: string, clientId: string) {
  const m = await prisma.user.findUnique({ where: { id } });
  if (!m || m.clientId !== clientId || m.role !== "CLIENT" || !m.isAgent) {
    throw new ApiError(404, "משווק לא נמצא");
  }
  return m;
}

const UpdateMarketer = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(30).nullable().optional(),
  password: z.string().min(6, "סיסמה קצרה מדי").optional().or(z.literal("")),
  active: z.boolean().optional(),
  projectIds: z.array(z.string()).max(200).optional(),
});

// PATCH /api/marketers/[id] — עריכת משווק: שם/טלפון/סיסמה/פעיל + שיוך פרויקטים.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const owner = await requireClientOwner();
  await ownedMarketer(params.id, owner.clientId);
  const body = UpdateMarketer.parse(await readJson(req));

  const revoke = Boolean(body.password) || body.active === false;
  await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.password ? { passwordHash: hashPassword(body.password) } : {}),
      ...(revoke ? { tokenVersion: { increment: 1 } } : {}),
    },
  });

  if (body.projectIds !== undefined) {
    await reconcileProjects(params.id, owner.clientId, body.projectIds);
  }

  return NextResponse.json({ ok: true });
});

// DELETE /api/marketers/[id] — מחיקת משווק (השיוכים נמחקים בקסקייד).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const owner = await requireClientOwner();
  await ownedMarketer(params.id, owner.clientId);
  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
