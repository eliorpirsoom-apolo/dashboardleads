import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/custom-fields?clientId=...
export const GET = handle(async (req) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const clientId = scopeClientId(user, url.searchParams.get("clientId"));
  const fields = await prisma.customFieldDef.findMany({
    where: { clientId, active: true },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ fields });
});

const CreateField = z.object({
  clientId: z.string().optional(),
  label: z.string().min(1, "חסר שם שדה").max(80),
  fieldType: z.enum(["text", "number", "date", "select", "boolean"]),
  options: z.array(z.string().min(1).max(80)).max(30).optional(),
});

// POST /api/custom-fields — client-defined lead field.
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = CreateField.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  if (body.fieldType === "select" && (!body.options || body.options.length === 0)) {
    throw new ApiError(400, "שדה בחירה חייב לפחות אפשרות אחת");
  }

  // Derive a stable key from the label (Hebrew-safe: fallback to field_N).
  const base = body.label
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const count = await prisma.customFieldDef.count({ where: { clientId } });
  const key = base && /^[a-z]/.test(base) ? base : `field_${count + 1}`;

  const exists = await prisma.customFieldDef.findUnique({
    where: { clientId_key: { clientId, key } },
  });
  const finalKey = exists ? `${key}_${count + 1}` : key;

  const last = await prisma.customFieldDef.findFirst({
    where: { clientId },
    orderBy: { order: "desc" },
  });

  const field = await prisma.customFieldDef.create({
    data: {
      clientId,
      key: finalKey,
      label: body.label,
      fieldType: body.fieldType,
      options: body.options ? JSON.stringify(body.options) : null,
      order: (last?.order ?? -1) + 1,
    },
  });
  return NextResponse.json({ field }, { status: 201 });
});
