import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/design-tasks?status&designerId&clientId — לוח הסטודיו (צד משרד).
export const GET = handle(async (req) => {
  await requireAdmin();
  const p = new URL(req.url).searchParams;
  const where: Record<string, unknown> = {};
  if (p.get("status")) where.status = p.get("status");
  if (p.get("designerId")) where.designerId = p.get("designerId");
  if (p.get("clientId")) where.clientId = p.get("clientId");

  const tasks = await prisma.designTask.findMany({
    where,
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      client: { select: { id: true, name: true, color: true } },
      designer: { select: { id: true, name: true } },
      _count: { select: { assets: true, feedback: true } },
    },
  });
  return NextResponse.json({ tasks });
});

const CreateDesignTask = z.object({
  clientId: z.string().min(1, "חסר לקוח"),
  projectId: z.string().nullable().optional(),
  title: z.string().min(1, "חסרה כותרת").max(200),
  briefType: z.enum(["landing", "logo", "post", "banner", "print", "branding"]).default("post"),
  brief: z.string().max(5000).nullable().optional(),
  specs: z.string().max(1000).nullable().optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  designerId: z.string().nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
});

// POST /api/design-tasks — בריף חדש.
export const POST = handle(async (req) => {
  const user = await requireAdmin();
  const b = CreateDesignTask.parse(await readJson(req));
  const client = await prisma.client.findUnique({ where: { id: b.clientId } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");

  const task = await prisma.designTask.create({
    data: {
      clientId: b.clientId,
      projectId: b.projectId || null,
      title: b.title,
      briefType: b.briefType,
      brief: b.brief || null,
      specs: b.specs || null,
      priority: b.priority,
      designerId: b.designerId || null,
      scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : null,
      dueAt: b.dueAt ? new Date(b.dueAt) : null,
      createdById: user.id,
      status: "scheduled",
    },
  });
  return NextResponse.json({ task }, { status: 201 });
});
