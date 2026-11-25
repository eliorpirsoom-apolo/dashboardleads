import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";
import { ilWeekStartUTC } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CATEGORIES = ["collect", "meetings", "office", "campaigns", "shoots", "misc"] as const;
type Cat = (typeof CATEGORIES)[number];

// מיפוי שם קטגוריה (עברית/אנגלית, גמיש) → מפתח. מה שלא זוהה → "משימות שונות".
const CATEGORY_ALIASES: Record<string, Cat> = {
  גבייה: "collect", גביה: "collect", גבית: "collect", collect: "collect", collection: "collect",
  פגישות: "meetings", פגישה: "meetings", meetings: "meetings", meeting: "meetings",
  "משימות משרד": "office", משרד: "office", office: "office",
  קמפיינים: "campaigns", קמפיין: "campaigns", campaigns: "campaigns", campaign: "campaigns",
  "ימי צילום": "shoots", "יום צילום": "shoots", צילום: "shoots", צילומים: "shoots", shoots: "shoots", shoot: "shoots",
  "משימות שונות": "misc", שונות: "misc", כללי: "misc", אחר: "misc", misc: "misc", other: "misc", general: "misc",
};

const norm = (s?: string | null) => (s ?? "").trim();

function resolveCategory(raw?: string | null): { cat: Cat; matched: boolean } {
  const key = norm(raw).toLowerCase(); // עברית אינה מושפעת מ-toLowerCase
  if (!key) return { cat: "misc", matched: true }; // ריק = ברירת מחדל לגיטימית, לא "לא זוהה"
  const hit = CATEGORY_ALIASES[key];
  return hit ? { cat: hit, matched: true } : { cat: "misc", matched: false };
}

function safeDate(raw?: string | null): Date | null {
  const v = norm(raw);
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const Row = z.object({
  category: z.string().optional().nullable(),
  client: z.string().optional().nullable(),
  project: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  at: z.string().optional().nullable(),
});

const ImportReq = z.object({
  week: z.enum(["this", "next"]).default("this"),
  rows: z.array(Row).min(1, "אין שורות לייבוא").max(1000, "מקסימום 1000 שורות בייבוא אחד"),
});

// POST /api/weekly-tasks/import — ייבוא מרובה מקובץ (שורות כבר ממופות בצד-לקוח).
// קטגוריה לפי שם, לקוח/פרויקט בהתאמה לפי שם, חדש-למעלה תוך שמירת סדר הקובץ.
export const POST = handle(async (req) => {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "tasks")) throw new ApiError(403, "אין הרשאה למודול המשימות");

  const body = ImportReq.parse(await readJson(req));
  const weekStart = new Date(ilWeekStartUTC().getTime() + (body.week === "next" ? WEEK_MS : 0));

  const [clients, projects] = await Promise.all([
    prisma.client.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.project.findMany({ where: { status: "active" }, select: { id: true, name: true, clientId: true } }),
  ]);
  const clientByName = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const projectByKey = new Map(projects.map((p) => [`${p.clientId}::${p.name.trim().toLowerCase()}`, p.id]));

  // ה-orderIndex הקטן ביותר שקיים בכל קטגוריה בשבוע — כדי להכניס את הייבוא מעליו.
  const mins = await prisma.weeklyTask.groupBy({
    by: ["category"],
    where: { weekStart },
    _min: { orderIndex: true },
  });
  const nextIdx = new Map<string, number>();
  for (const c of CATEGORIES) nextIdx.set(c, -1);
  for (const m of mins) nextIdx.set(m.category, (m._min.orderIndex ?? 0) - 1);

  const data: {
    weekStart: Date; category: string; title: string; note: string | null;
    clientId: string | null; projectId: string | null; at: Date | null;
    orderIndex: number; source: string; createdById: string | null; createdByName: string | null;
  }[] = [];
  const unmatchedClients = new Set<string>();
  const unmatchedProjects = new Set<string>();
  let uncategorized = 0;
  let skipped = 0;

  // הפוך את סדר השורות: השורה הראשונה בקובץ מעובדת אחרונה → מקבלת את ה-index
  // הקטן ביותר → מופיעה בראש. כך סדר הקובץ נשמר (ראשונה למעלה).
  for (const r of [...body.rows].reverse()) {
    const title = norm(r.title);
    if (!title) {
      skipped++;
      continue;
    }
    const { cat, matched } = resolveCategory(r.category);
    if (!matched) uncategorized++;

    let clientId: string | null = null;
    let projectId: string | null = null;
    const cname = norm(r.client);
    if (cname) {
      clientId = clientByName.get(cname.toLowerCase()) ?? null;
      if (!clientId) unmatchedClients.add(cname);
    }
    const pname = norm(r.project);
    if (pname) {
      projectId = clientId ? projectByKey.get(`${clientId}::${pname.toLowerCase()}`) ?? null : null;
      if (!projectId) unmatchedProjects.add(pname);
    }

    const idx = nextIdx.get(cat)!;
    nextIdx.set(cat, idx - 1);

    data.push({
      weekStart,
      category: cat,
      title: title.slice(0, 400),
      note: norm(r.note).slice(0, 2000) || null,
      clientId,
      projectId,
      at: safeDate(r.at),
      orderIndex: idx,
      source: "import",
      createdById: user.id,
      createdByName: user.name,
    });
  }

  if (!data.length) throw new ApiError(400, "אין שורות תקינות לייבוא (חסרה עמודת 'משימה')");
  await prisma.weeklyTask.createMany({ data });

  return NextResponse.json({
    created: data.length,
    skipped,
    uncategorized,
    unmatchedClients: [...unmatchedClients],
    unmatchedProjects: [...unmatchedProjects],
    week: body.week,
  });
});
