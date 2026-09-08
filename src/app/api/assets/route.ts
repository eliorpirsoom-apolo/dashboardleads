import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";

export const dynamic = "force-dynamic";

async function guard() {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "assets")) throw new ApiError(403, "אין הרשאה למודול הנכסים");
  return user;
}

// GET /api/assets — מרשם הנכסים: כל לקוח פעיל עם הנכסים הרשומים שלו +
// הדפים שמחוברים בפועל ל-CRM (אימות אוטומטי של "מחובר").
export const GET = handle(async () => {
  await guard();
  const [clients, assets, metaPages] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    prisma.digitalAsset.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.metaPage.findMany({
      where: { active: true },
      select: { clientId: true, pageId: true, pageName: true },
    }),
  ]);
  return NextResponse.json({ clients, assets, metaPages });
});

const CreateAsset = z.object({
  clientId: z.string().min(1),
  kind: z.enum(["business_manager", "page", "ad_account", "instagram", "google_ads", "other"]),
  name: z.string().max(200).nullable().optional(),
  externalId: z.string().max(120).nullable().optional(),
  ownership: z.enum(["client", "agency", "third_party"]).default("client"),
  ownerNote: z.string().max(300).nullable().optional(),
  access: z.enum(["full", "partial", "none"]).default("none"),
  accessUsers: z.string().max(400).nullable().optional(),
  role: z.string().max(120).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

// POST /api/assets — רישום נכס חדש (כל צוות המשרד).
export const POST = handle(async (req) => {
  await guard();
  const b = CreateAsset.parse(await readJson(req));
  const client = await prisma.client.findUnique({ where: { id: b.clientId }, select: { id: true } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");
  const asset = await prisma.digitalAsset.create({
    data: {
      clientId: b.clientId,
      kind: b.kind,
      name: b.name?.trim() || null,
      externalId: b.externalId?.trim() || null,
      ownership: b.ownership,
      ownerNote: b.ownerNote?.trim() || null,
      access: b.access,
      accessUsers: b.accessUsers?.trim() || null,
      role: b.role?.trim() || null,
      notes: b.notes?.trim() || null,
    },
  });
  return NextResponse.json({ asset }, { status: 201 });
});
