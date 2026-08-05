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

// GET /api/payments?year=YYYY — נתוני לוח התשלומים לשנה: לקוחות, סטטוסים, תאים וסטטיסטיקות.
export const GET = handle(async (req) => {
  await guard();
  const p = new URL(req.url).searchParams;
  const year = Number(p.get("year")) || new Date().getFullYear();

  const [clients, statuses, payments] = await Promise.all([
    prisma.client.findMany({ where: { active: true }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    prisma.paymentStatus.findMany({ orderBy: { order: "asc" } }),
    prisma.clientPayment.findMany({
      where: { year },
      select: { clientId: true, month: true, amount: true, statusId: true, note: true },
    }),
  ]);

  const paidStatusIds = new Set(statuses.filter((s) => s.isPaid).map((s) => s.id));

  // סטטיסטיקות: צפוי (כל הסכומים) מול נגבה (סטטוס isPaid) לפי חודש + פילוח סטטוסים.
  const byMonth = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, expected: 0, collected: 0 }));
  const byStatusMap = new Map<string, number>();
  let totalExpected = 0;
  let totalCollected = 0;
  for (const pay of payments) {
    const amt = pay.amount || 0;
    if (!amt) continue;
    totalExpected += amt;
    byMonth[pay.month - 1].expected += amt;
    const paid = pay.statusId ? paidStatusIds.has(pay.statusId) : false;
    if (paid) {
      totalCollected += amt;
      byMonth[pay.month - 1].collected += amt;
    }
    if (pay.statusId) byStatusMap.set(pay.statusId, (byStatusMap.get(pay.statusId) || 0) + amt);
  }
  const byStatus = statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, total: byStatusMap.get(s.id) || 0 }));

  return NextResponse.json({
    year,
    clients,
    statuses,
    payments,
    stats: { byMonth, byStatus, totalExpected, totalCollected, totalPending: totalExpected - totalCollected },
  });
});

const UpsertCell = z.object({
  clientId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.number().nullable().optional(),
  statusId: z.string().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

// POST /api/payments — עדכון/יצירת תא (לקוח×חודש). תא ריק לגמרי → נמחק.
export const POST = handle(async (req) => {
  await guard();
  const b = UpsertCell.parse(await readJson(req));
  const empty = (b.amount === null || b.amount === undefined || b.amount === 0) && !b.statusId && !b.note?.trim();
  if (empty) {
    await prisma.clientPayment.deleteMany({ where: { clientId: b.clientId, year: b.year, month: b.month } });
    return NextResponse.json({ ok: true, cleared: true });
  }
  const payment = await prisma.clientPayment.upsert({
    where: { clientId_year_month: { clientId: b.clientId, year: b.year, month: b.month } },
    update: { amount: b.amount ?? null, statusId: b.statusId ?? null, note: b.note ?? null },
    create: {
      clientId: b.clientId,
      year: b.year,
      month: b.month,
      amount: b.amount ?? null,
      statusId: b.statusId ?? null,
      note: b.note ?? null,
    },
  });
  return NextResponse.json({ payment });
});
