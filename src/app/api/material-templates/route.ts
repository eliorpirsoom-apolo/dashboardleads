import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { ensureDefaultTemplates, parseItems } from "@/lib/materials";

export const dynamic = "force-dynamic";

// GET /api/material-templates — תבניות ה"מכולת" (זריעה ראשונית אם ריק).
export const GET = handle(async () => {
  await requireAdmin();
  await ensureDefaultTemplates();
  const templates = await prisma.materialTemplate.findMany({
    orderBy: { order: "asc" },
  });
  return NextResponse.json({
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      items: parseItems(t.items),
    })),
  });
});

const CreateTemplate = z.object({
  name: z.string().min(1, "חסר שם").max(120),
  items: z.array(z.string().max(300)).max(60).default([]),
});

// POST — תבנית חדשה. מנהל בלבד.
export const POST = handle(async (req) => {
  await requireManager();
  const body = CreateTemplate.parse(await readJson(req));
  const exists = await prisma.materialTemplate.findUnique({ where: { name: body.name } });
  if (exists) throw new ApiError(409, "כבר קיימת תבנית בשם הזה");
  const count = await prisma.materialTemplate.count();
  const template = await prisma.materialTemplate.create({
    data: { name: body.name, items: JSON.stringify(body.items), order: count },
  });
  return NextResponse.json({ template }, { status: 201 });
});
