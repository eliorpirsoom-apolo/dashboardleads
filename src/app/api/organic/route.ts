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

const isManager = (u: { adminRole?: string | null }) => u.adminRole !== "staff";

// GET /api/organic?month=YYYY-MM — לוח הקידום: לקוחות עם מכסה/פעולות בחודש.
// עלויות (cost) נחשפות למנהלים בלבד.
export const GET = handle(async (req) => {
  const user = await guard();
  const month = new URL(req.url).searchParams.get("month") || "";
  if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError(400, "חודש לא תקין (YYYY-MM)");

  const [quotas, actions, clients] = await Promise.all([
    prisma.seoQuota.findMany({ select: { clientId: true, links: true, content: true, onsite: true, updates: true, notes: true } }),
    prisma.seoAction.findMany({
      where: { month },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "desc" }],
      include: { assignee: { select: { id: true, name: true } } },
    }),
    prisma.client.findMany({ where: { active: true }, select: { id: true, name: true, color: true } }),
  ]);

  const nameOf = new Map(clients.map((c) => [c.id, c]));
  const quotaOf = new Map(quotas.map((q) => [q.clientId, q]));
  const boardClientIds = new Set<string>([...quotas.map((q) => q.clientId), ...actions.map((a) => a.clientId)]);

  const manager = isManager(user);
  const blocks = [...boardClientIds]
    .filter((id) => nameOf.has(id))
    .map((id) => {
      const c = nameOf.get(id)!;
      const rows = actions.filter((a) => a.clientId === id);
      return {
        client: c,
        quota: quotaOf.get(id) ?? null,
        actions: rows.map((a) => ({
          id: a.id,
          kind: a.kind,
          title: a.title,
          url: a.url,
          targetPage: a.targetPage,
          anchor: a.anchor,
          status: a.status,
          doneAt: a.doneAt,
          notes: a.notes,
          images: a.images,
          orderIndex: a.orderIndex,
          assignee: a.assignee,
          cost: manager ? a.cost : null,
        })),
        totalCost: manager ? rows.reduce((s, a) => s + (a.cost || 0), 0) : null,
      };
    })
    .sort((a, b) => a.client.name.localeCompare(b.client.name, "he"));

  // לקוחות שאפשר להוסיף ללוח (עדיין בלי מכסה).
  const addable = clients.filter((c) => !quotaOf.has(c.id)).map((c) => ({ id: c.id, name: c.name }));

  return NextResponse.json({ month, blocks, addable, isManager: manager });
});

const KINDS = ["link", "content", "onsite", "update", "other"] as const;

const NewAction = z.object({
  clientId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  kind: z.enum(KINDS),
  title: z.string().min(1, "חסר תיאור").max(300),
  url: z.string().max(500).nullable().optional(),
  targetPage: z.string().max(500).nullable().optional(),
  anchor: z.string().max(200).nullable().optional(),
  cost: z.number().min(0).max(1000000).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
});

// POST /api/organic — פעולה חדשה (נכנסת בראש הבלוק — חדש למעלה).
export const POST = handle(async (req) => {
  const user = await guard();
  const b = NewAction.parse(await readJson(req));
  const first = await prisma.seoAction.findFirst({
    where: { clientId: b.clientId, month: b.month },
    orderBy: { orderIndex: "asc" },
    select: { orderIndex: true },
  });
  const action = await prisma.seoAction.create({
    data: {
      clientId: b.clientId,
      month: b.month,
      kind: b.kind,
      title: b.title.trim(),
      url: b.url?.trim() || null,
      targetPage: b.targetPage?.trim() || null,
      anchor: b.anchor?.trim() || null,
      cost: isManager(user) ? (b.cost ?? null) : null,
      assigneeId: b.assigneeId || null,
      orderIndex: (first?.orderIndex ?? 1) - 1,
    },
  });
  return NextResponse.json({ action }, { status: 201 });
});
