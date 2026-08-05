import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";

export const dynamic = "force-dynamic";

async function guard() {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "payments")) throw new ApiError(403, "אין הרשאה למודול התשלומים");
}

// GET /api/payments?year=YYYY — נתוני לוח התשלומים לשנה: לקוחות, סטטוסים ותאים (ריטיינר + חד-פעמי).
export const GET = handle(async (req) => {
  await guard();
  const p = new URL(req.url).searchParams;
  const year = Number(p.get("year")) || new Date().getFullYear();

  const [clients, statuses, payments] = await Promise.all([
    prisma.client.findMany({ where: { active: true }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    prisma.paymentStatus.findMany({ orderBy: { order: "asc" } }),
    prisma.clientPayment.findMany({
      where: { year },
      select: { clientId: true, month: true, kind: true, amount: true, sumitAmount: true, statusId: true, note: true },
    }),
  ]);

  return NextResponse.json({ year, clients, statuses, payments });
});

const KIND = z.enum(["retainer", "oneoff"]);

const UpsertCell = z.object({
  clientId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  kind: KIND.default("retainer"),
  amount: z.number().nullable().optional(),
  statusId: z.string().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

// POST /api/payments — עדכון/יצירת תא (לקוח×חודש×סוג). תא ריק לגמרי (וגם ללא סכום מ-SUMIT) → נמחק.
export const POST = handle(async (req) => {
  await guard();
  const b = UpsertCell.parse(await readJson(req));

  // האם קיים סכום אוטומטי מ-SUMIT שיש לשמר גם אם המשתמש ריקן ידנית.
  const existing = await prisma.clientPayment.findUnique({
    where: { clientId_year_month_kind: { clientId: b.clientId, year: b.year, month: b.month, kind: b.kind } },
    select: { sumitAmount: true },
  });
  const hasSumit = !!existing?.sumitAmount;

  const emptyManual = (b.amount === null || b.amount === undefined || b.amount === 0) && !b.statusId && !b.note?.trim();
  if (emptyManual && !hasSumit) {
    await prisma.clientPayment.deleteMany({
      where: { clientId: b.clientId, year: b.year, month: b.month, kind: b.kind },
    });
    return NextResponse.json({ ok: true, cleared: true });
  }

  const payment = await prisma.clientPayment.upsert({
    where: { clientId_year_month_kind: { clientId: b.clientId, year: b.year, month: b.month, kind: b.kind } },
    update: { amount: b.amount ?? null, statusId: b.statusId ?? null, note: b.note ?? null },
    create: {
      clientId: b.clientId,
      year: b.year,
      month: b.month,
      kind: b.kind,
      amount: b.amount ?? null,
      statusId: b.statusId ?? null,
      note: b.note ?? null,
    },
  });
  return NextResponse.json({ payment });
});
