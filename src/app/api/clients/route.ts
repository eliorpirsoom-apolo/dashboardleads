import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { createDefaultStatuses } from "@/lib/defaults";

export const dynamic = "force-dynamic";

// GET /api/clients — agency: all clients with quick stats.
export const GET = handle(async () => {
  await requireAdmin();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const clients = await prisma.client.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { users: true, leads: true } },
    },
  });

  // Per-client counts: new leads this week + open tasks.
  const [newLeads, openTasks] = await Promise.all([
    prisma.lead.groupBy({
      by: ["clientId"],
      where: { receivedAt: { gte: weekAgo }, archived: false },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["clientId"],
      where: { status: "open", clientId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const newLeadsMap = Object.fromEntries(
    newLeads.map((g) => [g.clientId, g._count._all])
  );
  const tasksMap = Object.fromEntries(
    openTasks.map((g) => [g.clientId as string, g._count._all])
  );

  return NextResponse.json({
    clients: clients.map((c) => ({
      ...c,
      newLeadsWeek: newLeadsMap[c.id] ?? 0,
      openTasks: tasksMap[c.id] ?? 0,
    })),
  });
});

const CreateClient = z.object({
  name: z.string().min(1, "חסר שם לקוח").max(120),
  type: z.enum(["general", "realestate", "seo"]).default("general"),
  company: z.string().max(200).optional().nullable(),
  contactName: z.string().max(120).optional().nullable(),
  contactEmail: z.string().email("אימייל לא תקין").optional().nullable().or(z.literal("")),
  contactPhone: z.string().max(30).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// POST /api/clients — create a client + its default statuses.
export const POST = handle(async (req) => {
  await requireAdmin();
  const body = CreateClient.parse(await readJson(req));

  const exists = await prisma.client.findUnique({ where: { name: body.name } });
  if (exists) throw new ApiError(409, "כבר קיים לקוח בשם הזה");

  const client = await prisma.$transaction(async (tx) => {
    const c = await tx.client.create({
      data: { ...body, contactEmail: body.contactEmail || null },
    });
    await createDefaultStatuses(tx, c.id);
    return c;
  });

  return NextResponse.json({ client }, { status: 201 });
});
