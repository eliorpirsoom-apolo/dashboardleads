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
// ערך חורג מהמגבלה מקוצר אוטומטית (transform) במקום להפיל את כל הקובץ בשגיאת
// Zod — באותה רוח סלחנית של דילוג-כפילויות והצמדת תאריכי-עתיד. כך תא בודד לא
// חוסם 145 שורות. הצד-לקוח מזהיר מראש איזו עמודה חורגת (וכנראה ממופה לא נכון).
const clampedStr = (max: number) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (typeof v === "string" ? v.slice(0, max) : v));

const ImportReq = z.object({
  clientId: z.string().min(1),
  rows: z
    .array(
      z.object({
        fullName: clampedStr(120),
        phone: clampedStr(40),
        email: clampedStr(160),
        city: clampedStr(80),
        channel: clampedStr(40),
        campaignLabel: clampedStr(160),
        consent: z.boolean().optional(),
        receivedAt: z.string().optional().nullable(),
        notes: clampedStr(1000),
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

      // לפי בקשת הבעלים (2026-11-16): ליד מיובא נכנס ב*תאריך הייבוא* (עכשיו),
      // ולא לפי "תאריך הקבלה" שבקובץ — כדי שכל המיובאים יופיעו יחד בראש הלוח
      // (newest-first) ולא "ישקעו" לפי תאריך ישן. העמודה "תאריך קבלה" במיפוי
      // כבר אינה משפיעה על סדר הקליטה.
      const receivedAt = new Date();
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
        receivedAt,
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
