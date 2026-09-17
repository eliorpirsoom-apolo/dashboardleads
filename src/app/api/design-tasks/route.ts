import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { sanitizeRich } from "@/lib/sanitizeHtml";
import { syncDesignTaskCalendar } from "@/lib/studioGcal";

export const dynamic = "force-dynamic";

// GET /api/design-tasks?status&designerId&clientId&q — לוח הסטודיו (צד משרד).
// q — חיפוש חופשי: כותרת/בריף/מפרט, לקוח, מעצב/ת, קבוצה, פרויקט, וגם שמות
// קבצים והערות של תוצרים (המשימה חוזרת עם matchedAssets — הקבצים שנמצאו).
export const GET = handle(async (req) => {
  await requireAdmin();
  const p = new URL(req.url).searchParams;
  const where: Record<string, unknown> = {};
  if (p.get("status")) where.status = p.get("status");
  if (p.get("designerId")) where.designerId = p.get("designerId");
  if (p.get("clientId")) where.clientId = p.get("clientId");

  const q = (p.get("q") || "").trim().slice(0, 80);
  const assetMatch = q
    ? { OR: [{ fileName: { contains: q, mode: "insensitive" as const } }, { note: { contains: q, mode: "insensitive" as const } }] }
    : null;
  if (q && assetMatch) {
    const c = { contains: q, mode: "insensitive" as const };
    where.OR = [
      { title: c },
      { brief: c },
      { specs: c },
      { client: { name: c } },
      { designer: { name: c } },
      { group: { name: c } },
      { project: { name: c } },
      { assets: { some: assetMatch } },
      { feedback: { some: { text: c } } },
    ];
  }

  const tasks = await prisma.designTask.findMany({
    where,
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      client: { select: { id: true, name: true, color: true } },
      designer: { select: { id: true, name: true } },
      _count: { select: { assets: true, feedback: true } },
      ...(assetMatch
        ? {
            assets: {
              where: assetMatch,
              select: { id: true, fileName: true, kind: true },
              orderBy: { createdAt: "desc" as const },
              take: 6,
            },
          }
        : {}),
    },
  });
  return NextResponse.json({
    tasks: tasks.map((t: any) => {
      const { assets, ...rest } = t;
      return assetMatch ? { ...rest, matchedAssets: assets ?? [] } : rest;
    }),
  });
});

const RefAsset = z.object({
  fileKey: z.string().min(1).max(400),
  fileName: z.string().max(200),
  mimeType: z.string().max(100).nullable().optional(),
});

const CreateDesignTask = z.object({
  clientId: z.string().min(1, "חסר לקוח"),
  projectId: z.string().nullable().optional(),
  title: z.string().min(1, "חסרה כותרת").max(200),
  briefType: z.enum(["landing", "logo", "post", "banner", "print", "branding"]).default("post"),
  brief: z.string().max(50000).nullable().optional(), // HTML עשיר: טקסט + תמונות מוטבעות (URL ל-R2, לא base64)
  specs: z.string().max(1000).nullable().optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  designerId: z.string().nullable().optional(),
  groupId: z.string().nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
  durationMin: z.number().int().min(15).max(720).nullable().optional(),
  dueAt: z.string().nullable().optional(),
  references: z.array(RefAsset).max(15).optional(), // רפרנסים/דוגמאות למעצב/ת
});

// POST /api/design-tasks — בריף חדש.
export const POST = handle(async (req) => {
  const user = await requireAdmin();
  const b = CreateDesignTask.parse(await readJson(req));
  const client = await prisma.client.findUnique({ where: { id: b.clientId } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");

  const groupId = b.groupId || null;
  // משימה חדשה נכנסת בראש הקבוצה (חדש = למעלה, כמו בכל המערכת).
  const first = await prisma.designTask.findFirst({
    where: { groupId },
    orderBy: { orderIndex: "asc" },
    select: { orderIndex: true },
  });

  const task = await prisma.designTask.create({
    data: {
      clientId: b.clientId,
      projectId: b.projectId || null,
      title: b.title,
      briefType: b.briefType,
      brief: b.brief ? sanitizeRich(b.brief) : null,
      specs: b.specs || null,
      priority: b.priority,
      designerId: b.designerId || null,
      groupId,
      orderIndex: (first?.orderIndex ?? 1) - 1,
      scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : null,
      durationMin: b.durationMin ?? null,
      dueAt: b.dueAt ? new Date(b.dueAt) : null,
      createdById: user.id,
      status: "scheduled",
    },
  });

  // רפרנסים/דוגמאות שהמשרד צירף בעת הבריף — נשמרים כ-kind="reference".
  if (b.references?.length) {
    await prisma.designAsset.createMany({
      data: b.references.map((r) => ({
        designTaskId: task.id,
        kind: "reference",
        round: 1,
        fileKey: r.fileKey,
        fileName: r.fileName,
        mimeType: r.mimeType || null,
        uploadedById: user.id,
      })),
    });
  }

  // בריף שנוצר כבר עם מעצב/ת + מועד — נכנס ליומן מיד (לא מחכה לעדכון הבא).
  if (task.designerId && task.scheduledAt) {
    await syncDesignTaskCalendar(task.id, user.id).catch((e) =>
      console.error("[studio:gcal]", e)
    );
  }

  return NextResponse.json({ task }, { status: 201 });
});
