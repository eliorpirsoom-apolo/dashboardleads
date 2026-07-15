import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/projects?clientId — projects with inventory + sales summary.
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));

  const projects = await prisma.project.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: {
      unitTypes: true,
      _count: { select: { leads: true, contracts: true } },
      contracts: { select: { value: true } },
    },
  });

  return NextResponse.json({
    projects: projects.map((pr) => ({
      id: pr.id,
      name: pr.name,
      description: pr.description,
      status: pr.status,
      logoKey: pr.logoKey,
      createdAt: pr.createdAt,
      leads: pr._count.leads,
      contracts: pr._count.contracts,
      contractsValue: pr.contracts.reduce((s, c) => s + c.value, 0),
      totalUnits: pr.unitTypes.reduce((s, u) => s + u.totalUnits, 0),
      soldUnits: pr.unitTypes.reduce((s, u) => s + u.soldUnits, 0),
      unitTypes: pr.unitTypes.length,
      units: pr.unitTypes.map((u) => ({
        id: u.id,
        name: u.name,
        available: u.totalUnits - u.soldUnits,
      })),
    })),
  });
});

const CreateProject = z.object({
  clientId: z.string().optional(),
  name: z.string().min(1, "חסר שם פרויקט").max(160),
  description: z.string().max(1000).nullable().optional(),
  unitTypes: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        rooms: z.number().nullable().optional(),
        price: z.number().min(0).default(0),
        totalUnits: z.number().int().min(0).default(0),
      })
    )
    .max(40)
    .optional(),
});

// POST /api/projects — project setup (name + initial unit types/inventory).
export const POST = handle(async (req) => {
  const user = await requireUser();
  assertNotAgent(user);
  const body = CreateProject.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  const exists = await prisma.project.findUnique({
    where: { clientId_name: { clientId, name: body.name } },
  });
  if (exists) throw new ApiError(409, "כבר קיים פרויקט בשם הזה");

  const project = await prisma.project.create({
    data: {
      clientId,
      name: body.name,
      description: body.description || null,
      unitTypes: body.unitTypes
        ? {
            create: body.unitTypes.map((u) => ({
              name: u.name,
              rooms: u.rooms ?? null,
              price: u.price,
              totalUnits: u.totalUnits,
            })),
          }
        : undefined,
    },
    include: { unitTypes: true },
  });

  return NextResponse.json({ project }, { status: 201 });
});
