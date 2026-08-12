import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/documents?clientId&category&month&projectId&leadId
// בלי leadId — מסמכי הלקוח הכלליים בלבד; עם leadId — מסמכי הליד (כרטיס הליד).
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));

  const documents = await prisma.document.findMany({
    where: {
      clientId,
      leadId: p.get("leadId") || null,
      ...(p.get("category") ? { category: p.get("category")! } : {}),
      ...(p.get("month") ? { month: p.get("month")! } : {}),
      ...(p.get("projectId") ? { projectId: p.get("projectId")! } : {}),
    },
    orderBy: [{ month: "desc" }, { createdAt: "desc" }],
    include: {
      uploadedBy: { select: { name: true } },
      project: { select: { name: true } },
      unitType: { select: { name: true } },
    },
  });
  return NextResponse.json({ documents });
});

const CreateDoc = z.object({
  clientId: z.string().optional(),
  category: z.enum([
    "agreement", "invoice", "receipt_facebook", "receipt_google",
    "floor_plan", "contract", "logo", "other",
    // מסמכי ליד (מועלים מכרטיס הליד עם leadId)
    "id_card", "purchase_request", "approval",
  ]),
  title: z.string().max(200).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  fileKey: z.string().min(1).max(400),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().min(0),
  projectId: z.string().nullable().optional(),
  unitTypeId: z.string().nullable().optional(),
  leadId: z.string().nullable().optional(),
});

// POST /api/documents — register metadata after the bytes were uploaded.
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = CreateDoc.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  // The file key must belong to this client's namespace (no cross-writes).
  if (!body.fileKey.startsWith(`clients/${clientId}/`)) {
    throw new ApiError(403, "מפתח קובץ לא שייך ללקוח זה");
  }

  // מסמך ליד — הליד חייב להשתייך לאותו לקוח.
  if (body.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: body.leadId }, select: { clientId: true } });
    if (!lead || lead.clientId !== clientId) throw new ApiError(403, "ליד לא שייך ללקוח זה");
  }

  const doc = await prisma.document.create({
    data: {
      clientId,
      category: body.category,
      title: body.title || body.fileName,
      month: body.month ?? null,
      fileKey: body.fileKey,
      fileName: body.fileName,
      mimeType: body.mimeType,
      size: body.size,
      projectId: body.projectId || null,
      unitTypeId: body.unitTypeId || null,
      leadId: body.leadId || null,
      uploadedById: user.id,
    },
  });
  return NextResponse.json({ document: doc }, { status: 201 });
});
