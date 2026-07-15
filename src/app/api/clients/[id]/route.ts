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
  contactName: z.string().max(120).nullable().optional(),
  contactEmail: z.string().email().nullable().optional().or(z.literal("")),
  contactPhone: z.string().max(30).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  logoKey: z.string().max(300).nullable().optional(),
  active: z.boolean().optional(),
});

// PATCH /api/clients/[id] — agency manager only (profile edits, deactivation).
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const actor = await requireManager();
  const body = UpdateClient.parse(await readJson(req));
  const client = await prisma.client.update({
    where: { id: params.id },
    data: { ...body, contactEmail: body.contactEmail === "" ? null : body.contactEmail },
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
