import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { listPageForms, parseRouting } from "@/lib/integrations/metaLeads";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/integrations/meta/forms?id=<metaPageDbId> — טפסי העמוד + הניתוב
// הקיים + פרויקטי הלקוח (לעורך הניתוב ברמת הלקוח). מנהלים בלבד.
// GET ?projectId=<projectId> — תצוגת פרויקט: כל עמודי הלקוח עם הטפסים
// והניתוב שלהם, כדי שכל פרויקט יראה וינהל רק את הטפסים שלו.
export const GET = handle(async (req) => {
  await requireManager();
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id") || "";
  const projectId = sp.get("projectId") || "";

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true },
    });
    if (!project) throw new ApiError(404, "פרויקט לא נמצא");
    const pages = await prisma.metaPage.findMany({
      where: { clientId: project.clientId, active: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, pageName: true, projectId: true, routing: true },
    });
    const out = [];
    for (const p of pages) {
      try {
        const forms = await listPageForms(p.id);
        out.push({
          id: p.id,
          pageName: p.pageName,
          defaultProjectId: p.projectId,
          routing: parseRouting(p.routing),
          forms,
        });
      } catch {
        // עמוד עם טוקן שנשבר — לא מפיל את התצוגה של שאר העמודים.
      }
    }
    return NextResponse.json({ pages: out });
  }

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
  // ברירת מחדל לטפסים לא-משויכים: undefined = בלי שינוי; null = ללא פרויקט
  // (לידים נשמרים ללקוח וממתינים לשיוך); מזהה = פרויקט ברירת המחדל.
  defaultProjectId: z.string().min(1).nullable().optional(),
});

// POST — שמירת כללי הניתוב (טופס → פרויקט) + ברירת המחדל של החיבור.
// פרויקטים חייבים להיות של אותו לקוח.
export const POST = handle(async (req) => {
  await requireManager();
  const b = SaveRouting.parse(await readJson(req));
  const page = await prisma.metaPage.findUnique({
    where: { id: b.id },
    select: { id: true, clientId: true, sourceId: true },
  });
  if (!page) throw new ApiError(404, "החיבור לא נמצא");
  const projectIds = [...new Set(b.routing.map((r) => r.projectId))];
  if (b.defaultProjectId) projectIds.push(b.defaultProjectId);
  const uniqueIds = [...new Set(projectIds)];
  if (uniqueIds.length) {
    const owned = await prisma.project.count({ where: { id: { in: uniqueIds }, clientId: page.clientId } });
    if (owned !== uniqueIds.length) throw new ApiError(400, "פרויקט יעד שאינו של הלקוח");
  }
  const touchDefault = b.defaultProjectId !== undefined;
  await prisma.$transaction([
    prisma.metaPage.update({
      where: { id: page.id },
      data: {
        routing: b.routing.length ? JSON.stringify(b.routing) : null,
        ...(touchDefault ? { projectId: b.defaultProjectId } : {}),
      },
    }),
    // המקור של החיבור קולט את הלידים מטפסים ללא כלל — הפרויקט שלו חייב
    // להישאר מסונכרן עם ברירת המחדל (הוא מה שקובע לאן הליד נכנס בפועל).
    ...(touchDefault
      ? [
          prisma.leadSource.update({
            where: { id: page.sourceId },
            data: { projectId: b.defaultProjectId },
          }),
        ]
      : []),
  ]);
  return NextResponse.json({ ok: true, rules: b.routing.length });
});
