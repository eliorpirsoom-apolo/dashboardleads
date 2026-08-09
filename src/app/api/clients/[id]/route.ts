import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  handle,
  requireUser,
  readJson,
  ApiError,
} from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { parseMsgConfig, serializeMsgConfig } from "@/lib/messagingConfig";

export const dynamic = "force-dynamic";

// GET /api/clients/[id] — admin, or the client's own users.
export const GET = handle(async (_req, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.clientId !== params.id) {
    throw new ApiError(403, "אין הרשאה ללקוח זה");
  }
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      users: {
        select: {
          id: true, email: true, name: true, isAgent: true,
          active: true, lastLoginAt: true, phone: true, googleId: true,
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { leads: true, projects: true, documents: true } },
    },
  });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");
  return NextResponse.json({ client });
});

const UpdateClient = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(["general", "realestate", "seo"]).optional(),
  company: z.string().max(200).nullable().optional(),
  companyId: z.string().max(20).nullable().optional(), // ח.פ / ע.מ
  contactName: z.string().max(120).nullable().optional(),
  contactEmail: z.string().email().nullable().optional().or(z.literal("")),
  contactPhone: z.string().max(30).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  logoKey: z.string().max(300).nullable().optional(),
  birthday: z.string().max(10).nullable().optional().or(z.literal("")),
  autoAssignLeads: z.boolean().optional(),
  active: z.boolean().optional(),
  // הרשאות דיוור שהמשרד מגדיר ("מותר").
  messagingAllowed: z
    .object({
      broadcast: z.boolean(),
      leadAlerts: z.boolean(),
      email: z.boolean(),
      sms: z.boolean(),
      whatsapp: z.boolean(),
    })
    .partial()
    .optional(),
});

// PATCH /api/clients/[id] — agency manager only (profile edits, deactivation).
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const actor = await requireManager();
  const { messagingAllowed, ...body } = UpdateClient.parse(await readJson(req));

  // עדכון שכבת "מותר" בהרשאות הדיוור (משרד בלבד), בלי לדרוס את "פעיל" של הלקוח.
  let messagingConfig: string | undefined;
  if (messagingAllowed) {
    const cur = await prisma.client.findUnique({
      where: { id: params.id },
      select: { messagingConfig: true },
    });
    const cfg = parseMsgConfig(cur?.messagingConfig);
    cfg.allowed = { ...cfg.allowed, ...messagingAllowed };
    messagingConfig = serializeMsgConfig(cfg);
  }

  const client = await prisma.client.update({
    where: { id: params.id },
    data: {
      ...body,
      contactEmail: body.contactEmail === "" ? null : body.contactEmail,
      birthday: body.birthday === "" ? null : body.birthday,
      ...(messagingConfig !== undefined ? { messagingConfig } : {}),
    },
  });
  if (body.active !== undefined) {
    await audit(
      actor,
      body.active ? "client_activated" : "client_deactivated",
      "client",
      client.id,
      client.name
    );
  } else {
    await audit(actor, "client_updated", "client", client.id, client.name);
  }
  return NextResponse.json({ client });
});

// DELETE /api/clients/[id] — מחיקה קבועה (מנהל בלבד) + כל המידע המקושר (cascade):
// לידים, משימות, סטודיו, מסמכים, חשבוניות ומשתמשי הלקוח. בלתי-הפיך.
// אישור חזק: גוף הבקשה חייב לכלול confirmName התואם בדיוק לשם הלקוח.
export const DELETE = handle(async (req, { params }: { params: { id: string } }) => {
  const actor = await requireManager();
  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");

  const body = await readJson(req).catch(() => ({}));
  const confirmName = typeof (body as any)?.confirmName === "string" ? (body as any).confirmName.trim() : "";
  if (confirmName !== client.name.trim()) {
    throw new ApiError(400, "שם האישור אינו תואם לשם הלקוח");
  }

  await prisma.client.delete({ where: { id: params.id } });
  await audit(actor, "client_deleted", "client", client.id, client.name);
  return NextResponse.json({ ok: true });
});
