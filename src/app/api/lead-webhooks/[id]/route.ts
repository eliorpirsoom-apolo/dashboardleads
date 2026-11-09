import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function validFieldMap(s: string | null | undefined): boolean {
  if (!s) return true;
  try {
    const m = JSON.parse(s);
    return !!m && typeof m === "object" && !Array.isArray(m) &&
      Object.values(m).every((v) => typeof v === "string");
  } catch {
    return false;
  }
}

const Patch = z.object({
  projectId: z.string().min(1).nullable().optional(),
  name: z.string().min(1).max(120).optional(),
  url: z.string().url("כתובת לא תקינה").max(1000).optional(),
  method: z.enum(["POST", "GET", "PUT", "PATCH"]).optional(),
  format: z.enum(["json", "form"]).optional(),
  authHeader: z.string().max(100).nullable().optional(),
  authValue: z.string().max(4000).nullable().optional(),
  secret: z.string().max(200).nullable().optional(),
  fieldMap: z.string().max(8000).nullable().optional(),
  active: z.boolean().optional(),
});

// PATCH /api/lead-webhooks/[id] — עדכון יעד.
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  await requireManager();
  const hook = await prisma.leadWebhook.findUnique({ where: { id: params.id } });
  if (!hook) throw new ApiError(404, "יעד לא נמצא");
  const b = Patch.parse(await readJson(req));
  if ("fieldMap" in b && !validFieldMap(b.fieldMap)) {
    throw new ApiError(400, "מיפוי השדות חייב להיות JSON תקין של { שם-יעד: שם-שדה }");
  }
  if (b.projectId) {
    const project = await prisma.project.findUnique({ where: { id: b.projectId } });
    if (!project || project.clientId !== hook.clientId) throw new ApiError(400, "פרויקט לא תקין");
  }

  const data: Record<string, unknown> = {};
  if ("projectId" in b) data.projectId = b.projectId ?? null;
  if ("name" in b) data.name = b.name;
  if ("url" in b) data.url = b.url;
  if ("method" in b) data.method = b.method;
  if ("format" in b) data.format = b.format;
  if ("authHeader" in b) data.authHeader = b.authHeader || null;
  if ("authValue" in b) data.authValue = b.authValue || null;
  if ("secret" in b) data.secret = b.secret || null;
  if ("fieldMap" in b) data.fieldMap = b.fieldMap || null;
  if ("active" in b) data.active = b.active;

  const webhook = await prisma.leadWebhook.update({ where: { id: hook.id }, data });
  return NextResponse.json({ webhook });
});

// DELETE /api/lead-webhooks/[id] — מחיקת יעד + היומן שלו (cascade).
export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  await requireManager();
  const hook = await prisma.leadWebhook.findUnique({ where: { id: params.id } });
  if (!hook) throw new ApiError(404, "יעד לא נמצא");
  await prisma.leadWebhook.delete({ where: { id: hook.id } });
  return NextResponse.json({ ok: true, deleted: true });
});
