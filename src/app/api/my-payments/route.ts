import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { requireClientOwner } from "@/lib/marketers";

export const dynamic = "force-dynamic";

// GET /api/my-payments?year=YYYY — התשלומים של הלקוח עצמו, לקריאה בלבד.
// בעל-הכרטיס בלבד (משווק חסום). לא כולל עריכה.
export const GET = handle(async (req) => {
  const owner = await requireClientOwner();
  const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getFullYear();

  const [statuses, payments] = await Promise.all([
    prisma.paymentStatus.findMany({
      orderBy: { order: "asc" },
      select: { id: true, name: true, color: true, isPaid: true },
    }),
    prisma.clientPayment.findMany({
      where: { clientId: owner.clientId, year },
      select: { month: true, kind: true, amount: true, sumitAmount: true, statusId: true },
    }),
  ]);

  return NextResponse.json({ year, statuses, payments });
});
