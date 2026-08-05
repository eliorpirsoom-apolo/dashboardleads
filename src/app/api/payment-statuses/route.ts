import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";

export const dynamic = "force-dynamic";

async function guard() {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "payments")) throw new ApiError(403, "אין הרשאה למודול התשלומים");
  return user;
}

const DEFAULTS = [
  { name: "חשבונית יצאה", color: "#f59e0b", order: 0, isPaid: false },
  { name: "צ׳ק לא הופקד", color: "#8b5cf6", order: 1, isPaid: false },
  { name: "שולם", color: "#10b981", order: 2, isPaid: true },
];

// GET /api/payment-statuses — רשימת סטטוסי תשלום (זריעת ברירת מחדל בפעם הראשונה).
export const GET = handle(async () => {
  await guard();
  let statuses = await prisma.paymentStatus.findMany({ orderBy: { order: "asc" } });
  if (statuses.length === 0) {
    await prisma.paymentStatus.createMany({ data: DEFAULTS });
    statuses = await prisma.paymentStatus.findMany({ orderBy: { order: "asc" } });
  }
  return NextResponse.json({ statuses });
});

const NewStatus = z.object({
  name: z.string().min(1, "חסר שם").max(60),
  color: z.string().max(20).optional(),
  isPaid: z.boolean().optional(),
});

// POST /api/payment-statuses — הוספת סטטוס חדש.
export const POST = handle(async (req) => {
  await guard();
  const b = NewStatus.parse(await readJson(req));
  const last = await prisma.paymentStatus.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const status = await prisma.paymentStatus.create({
    data: {
      name: b.name.trim(),
      color: b.color || "#94a3b8",
      isPaid: b.isPaid ?? false,
      order: (last?.order ?? -1) + 1,
    },
  });
  return NextResponse.json({ status }, { status: 201 });
});
