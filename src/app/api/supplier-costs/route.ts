import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, readJson } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { ensureSupplierDefaults, refreshSupplierEstimates } from "@/lib/supplierCosts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/supplier-costs?category=crm|office — טבלת עלויות (מנהלים בלבד).
// אומדנים דינמיים (בקטגוריית crm) מתרעננים אוטומטית אם עברו 7 ימים.
export const GET = handle(async (req) => {
  await requireManager();
  const category = new URL(req.url).searchParams.get("category") === "office" ? "office" : "crm";
  if (category === "crm") {
    await ensureSupplierDefaults();
    await refreshSupplierEstimates(false).catch(() => {});
  }
  const rows = await prisma.supplierCost.findMany({
    where: { active: true, category },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
  });
  const amountOf = (r: (typeof rows)[number]) => (r.kind === "fixed" ? r.fixedAmount ?? 0 : r.lastEstimate ?? 0);
  const totals = {
    usd: Math.round(rows.filter((r) => r.currency === "USD").reduce((s, r) => s + amountOf(r), 0) * 100) / 100,
    ils: Math.round(rows.filter((r) => r.currency === "ILS").reduce((s, r) => s + amountOf(r), 0) * 100) / 100,
  };
  return NextResponse.json({ rows, totals });
});

const NewRow = z.object({
  name: z.string().min(1).max(120),
  note: z.string().max(300).nullable().optional(),
  currency: z.enum(["USD", "ILS"]).default("USD"),
  fixedAmount: z.number().min(0).max(1000000).nullable().optional(),
  category: z.enum(["crm", "office"]).default("crm"),
  refresh: z.undefined().optional(),
});

// POST /api/supplier-costs — שורה ידנית חדשה, או {refresh:true} לרענון אומדנים מיידי.
export const POST = handle(async (req) => {
  await requireManager();
  const raw = await readJson(req);
  if ((raw as any)?.refresh === true) {
    const updated = await refreshSupplierEstimates(true);
    return NextResponse.json({ ok: true, updated });
  }
  const b = NewRow.parse(raw);
  const last = await prisma.supplierCost.findFirst({
    where: { category: b.category },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  const row = await prisma.supplierCost.create({
    data: {
      category: b.category,
      name: b.name.trim(),
      note: b.note?.trim() || null,
      currency: b.currency,
      kind: "fixed",
      fixedAmount: b.fixedAmount ?? 0,
      orderIndex: (last?.orderIndex ?? -1) + 1,
    },
  });
  return NextResponse.json({ row }, { status: 201 });
});
