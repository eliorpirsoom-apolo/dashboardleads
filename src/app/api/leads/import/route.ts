import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import {
  createLeadNumbered,
  defaultStatusId,
  findDuplicateLead,
  normalizeEmail,
  normalizePhone,
} from "@/lib/leads";
import { recordActivity } from "@/lib/leadActivity";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// CSV import — agency managers only (approved decision 3: המשרד כשומר סף).
const ImportReq = z.object({
  clientId: z.string().min(1),
  rows: z
    .array(
      z.object({
        fullName: z.string().max(120).optional().nullable(),
        phone: z.string().max(40).optional().nullable(),
        email: z.string().max(160).optional().nullable(),
        city: z.string().max(80).optional().nullable(),
        channel: z.string().max(40).optional().nullable(),
        campaignLabel: z.string().max(160).optional().nullable(),
        consent: z.boolean().optional(),
        receivedAt: z.string().optional().nullable(),
        notes: z.string().max(1000).optional().nullable(),
      })
    )
    .min(1, "אין שורות לייבוא")
    .max(2000, "מקסימום 2000 שורות בייבוא אחד"),
});

// POST /api/leads/import — bulk-create with per-row dedupe + result report.
export const POST = handle(async (req) => {
  const actor = await requireManager();
  const body = ImportReq.parse(await readJson(req));

  const client = await prisma.client.findUnique({ where: { id: body.clientId } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");

  const statusId = await defaultStatusId(client.id);
  let created = 0;
  let duplicates = 0;
  let failed = 0;

  for (const row of body.rows) {
    try {
      const phone = normalizePhone(row.phone);
      const email = normalizeEmail(row.email);
      if (!phone && !email && !row.fullName?.trim()) {
        failed++;
        continue;
      }
      // Dedupe across ALL time for imports (not just 24h) — same phone/email.
      const dup =
        phone || email
          ? await prisma.lead.findFirst({
              where: {
                clientId: client.id,
                archived: false,
                OR: [
                  ...(phone ? [{ phone }] : []),
                  ...(email ? [{ email }] : []),
                ],
              },
            })
          : null;
      if (dup) {
        duplicates++;
        continue;
      }

      const receivedAt = row.receivedAt ? new Date(row.receivedAt) : new Date();
      const lead = await createLeadNumbered({
        clientId: client.id,
        kind: "manual",
        statusId,
        fullName: row.fullName?.trim() || null,
        phone,
        email,
        city: row.city?.trim() || null,
        channel: row.channel?.trim() || null,
        campaignLabel: row.campaignLabel?.trim() || null,
        consent: row.consent ?? false,
        receivedAt: isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
      });
      if (row.notes?.trim()) {
        await prisma.leadNote.create({
          data: {
            leadId: lead.id,
            authorName: actor.name,
            body: row.notes.trim(),
          },
        });
      }
      await recordActivity(lead.id, actor.name, "import", { note: "ייבוא CSV" });
      created++;
    } catch {
      failed++;
    }
  }

  await audit(
    actor,
    "leads_imported",
    "client",
    client.id,
    `${created} נוצרו, ${duplicates} כפולים, ${failed} נכשלו`
  );

  return NextResponse.json({ created, duplicates, failed });
});
