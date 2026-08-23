import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { listPageForms, parseRouting } from "@/lib/integrations/metaLeads";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/integrations/meta/forms?id=<metaPageDbId> — טפסי העמוד + הניתוב
// הקיים + פרויקטי הלקוח (לבחירת יעד). מנהלים בלבד.
export const GET = handle(async (req) => {
  await requireManager();
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) throw new ApiError(400, "חסר מזהה חיבור");
  const page = await prisma.metaPage.findUnique({
    where: { id },
    select: { id: true, clientId: true, projectId: true, routing: true, pageName: true },
  });
  if (!page) throw new ApiError(404, "החיבור לא נמצא");
  const [forms, projects] = await Promise.all([
    listPageForms(id),
    prisma.project.findMany({
      where: { clientId: page.clientId, status: { not: "archived" } },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return NextResponse.json({
    pageName: page.pageName,
    defaultProjectId: page.projectId,
    forms,
    routing: parseRouting(page.routing),
    projects,
  });
});

const SaveRouting = z.object({
  id: z.string().min(1),
  routing: z
    .array(
      z.object({
        formId: z.string().min(1),
        formName: z.string().max(200).optional(),
        projectId: z.string().min(1),
      })
    )
    .max(100),
});

// POST — שמירת כללי הניתוב (טופס → פרויקט). פרויקטים חייבים להיות של אותו לקוח.
export const POST = handle(async (req) => {
  await requireManager();
  const b = SaveRouting.parse(await readJson(req));
  const page = await prisma.metaPage.findUnique({
    where: { id: b.id },
    select: { id: true, clientId: true },
  });
  if (!page) throw new ApiError(404, "החיבור לא נמצא");
  const projectIds = [...new Set(b.routing.map((r) => r.projectId))];
  if (projectIds.length) {
    const owned = await prisma.project.count({ where: { id: { in: projectIds }, clientId: page.clientId } });
    if (owned !== projectIds.length) throw new ApiError(400, "פרויקט יעד שאינו של הלקוח");
  }
  await prisma.metaPage.update({
    where: { id: page.id },
    data: { routing: b.routing.length ? JSON.stringify(b.routing) : null },
  });
  return NextResponse.json({ ok: true, rules: b.routing.length });
});
