import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// שיגור לידים החוצה — יעדי webhook. צד משרד בלבד (מפתחות = סודות).
// ---------------------------------------------------------------------------

// GET /api/lead-webhooks?clientId=...  — כל יעדי הלקוח (כלל-לקוח + פר-פרויקט).
export const GET = handle(async (req) => {
  await requireAdmin();
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) throw new ApiError(400, "חסר מזהה לקוח");
  const webhooks = await prisma.leadWebhook.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
    include: {
      project: { select: { id: true, name: true } },
      _count: { select: { logs: true } },
    },
  });
  return NextResponse.json({ webhooks });
});

// אימות שה-fieldMap הוא אובייקט JSON תקין של מחרוזת→מחרוזת.
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

const Create = z.object({
  clientId: z.string().min(1),
  projectId: z.string().min(1).nullable().optional(),
  name: z.string().min(1, "חסר שם יעד").max(120),
  url: z.string().url("כתובת לא תקינה").max(1000),
  method: z.enum(["POST", "PUT", "PATCH"]).default("POST"),
  format: z.enum(["json", "form"]).default("json"),
  authHeader: z.string().max(100).nullable().optional(),
  authValue: z.string().max(4000).nullable().optional(),
  secret: z.string().max(200).nullable().optional(),
  fieldMap: z.string().max(8000).nullable().optional(),
  active: z.boolean().optional(),
});

// POST /api/lead-webhooks — יצירת יעד שיגור.
export const POST = handle(async (req) => {
  await requireManager();
  const b = Create.parse(await readJson(req));
  if (!validFieldMap(b.fieldMap)) {
    throw new ApiError(400, "מיפוי השדות חייב להיות JSON תקין של { שם-יעד: שם-שדה }");
  }

  const client = await prisma.client.findUnique({ where: { id: b.clientId } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");
  if (b.projectId) {
    const project = await prisma.project.findUnique({ where: { id: b.projectId } });
    if (!project || project.clientId !== b.clientId) throw new ApiError(400, "פרויקט לא תקין");
  }

  const webhook = await prisma.leadWebhook.create({
    data: {
      clientId: b.clientId,
      projectId: b.projectId ?? null,
      name: b.name,
      url: b.url,
      method: b.method,
      format: b.format,
      authHeader: b.authHeader || null,
      authValue: b.authValue || null,
      secret: b.secret || null,
      fieldMap: b.fieldMap || null,
      active: b.active ?? true,
    },
  });
  return NextResponse.json({ webhook }, { status: 201 });
});
