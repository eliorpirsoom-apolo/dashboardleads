import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";

export const dynamic = "force-dynamic";

async function guard() {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "organic")) throw new ApiError(403, "אין הרשאה למודול קידום אורגני");
  return user;
}

const UpsertQuota = z.object({
  clientId: z.string().min(1),
  links: z.number().int().min(0).max(999).optional(),
  content: z.number().int().min(0).max(999).optional(),
  onsite: z.number().int().min(0).max(999).optional(),
  updates: z.number().int().min(0).max(999).optional(),
  notes: z.string().max(500).nullable().optional(),
});

// POST /api/organic/quota — הוספת לקוח ללוח / עדכון המכסה החודשית שלו.
export const POST = handle(async (req) => {
  await guard();
  const b = UpsertQuota.parse(await readJson(req));
  const client = await prisma.client.findUnique({ where: { id: b.clientId }, select: { id: true } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");
  const data = {
    links: b.links ?? 0,
    content: b.content ?? 0,
    onsite: b.onsite ?? 0,
    updates: b.updates ?? 0,
    notes: b.notes ?? null,
  };
  const quota = await prisma.seoQuota.upsert({
    where: { clientId: b.clientId },
    update: data,
    create: { clientId: b.clientId, ...data },
  });
  return NextResponse.json({ quota });
});

// DELETE /api/organic/quota?clientId=... — הסרת לקוח מהלוח (הפעולות נשמרות בהיסטוריה).
export const DELETE = handle(async (req) => {
  await guard();
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) throw new ApiError(400, "חסר לקוח");
  await prisma.seoQuota.deleteMany({ where: { clientId } });
  return NextResponse.json({ ok: true });
});
