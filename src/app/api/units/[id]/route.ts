import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { assertNotAgent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

async function scopedUnit(id: string) {
  const user = await requireUser();
  const unit = await prisma.unitType.findUnique({
    where: { id },
    include: { project: true },
  });
  if (!unit) throw new ApiError(404, "טיפוס דירה לא נמצא");
  scopeClientId(user, unit.project.clientId);
  return { user, unit };
}

const UpdateUnit = z.object({
  name: z.string().min(1).max(120).optional(),
  rooms: z.number().nullable().optional(),
  price: z.number().min(0).optional(),
  totalUnits: z.number().int().min(0).optional(),
  // Manual inventory correction: +1 returns a unit to stock, -1 marks sold.
  manualAdjust: z.number().int().min(-1).max(1).optional(),
  note: z.string().max(300).optional(),
});

// PATCH /api/units/[id] — price changes are audited (PriceChange),
// manual inventory adjustments are audited (InventoryEvent).
export const PATCH = handle(async (req, { params }: { params: { id: string } }) => {
  const { user, unit } = await scopedUnit(params.id);
  const body = UpdateUnit.parse(await readJson(req));

  // סוכן מכירות רשאי רק לעדכן מלאי ("נמכרה"/"חזרה") — לא מחיר, שם או כמות.
  if (user.role === "CLIENT" && user.isAgent) {
    const touchesConfig =
      body.name !== undefined ||
      body.rooms !== undefined ||
      body.price !== undefined ||
      body.totalUnits !== undefined;
    if (touchesConfig || body.manualAdjust === undefined) {
      throw new ApiError(403, "סוכן יכול לעדכן מלאי בלבד; שינויי מחיר והגדרות שמורים לבעלים");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Price history
    if (body.price !== undefined && body.price !== unit.price) {
      await tx.priceChange.create({
        data: {
          unitTypeId: unit.id,
          oldPrice: unit.price,
          newPrice: body.price,
          changedBy: user.name,
        },
      });
    }

    // Manual inventory adjustment with guards + audit
    let soldDelta = 0;
    if (body.manualAdjust) {
      const nextSold = unit.soldUnits - body.manualAdjust; // +1 adjust => sold-1
      const total = body.totalUnits ?? unit.totalUnits;
      if (nextSold < 0) throw new ApiError(400, "אין דירות מכורות להחזרה");
      if (nextSold > total) throw new ApiError(400, "חריגה מהמלאי הכולל");
      soldDelta = -body.manualAdjust;
      await tx.inventoryEvent.create({
        data: {
          unitTypeId: unit.id,
          delta: body.manualAdjust,
          reason: "manual",
          actorName: user.name,
          note: body.note || (body.manualAdjust > 0 ? "החזרה ידנית למלאי" : "סימון ידני כנמכרה"),
        },
      });
    }

    // totalUnits guard: cannot drop below already-sold count
    if (body.totalUnits !== undefined && body.totalUnits < unit.soldUnits + soldDelta) {
      throw new ApiError(400, "המלאי הכולל לא יכול לרדת מתחת למספר שכבר נמכר");
    }

    return tx.unitType.update({
      where: { id: unit.id },
      data: {
        name: body.name,
        rooms: body.rooms,
        price: body.price,
        totalUnits: body.totalUnits,
        ...(soldDelta ? { soldUnits: { increment: soldDelta } } : {}),
      },
    });
  });

  return NextResponse.json({ unit: updated });
});

export const DELETE = handle(async (_req, { params }: { params: { id: string } }) => {
  const { user, unit } = await scopedUnit(params.id);
  assertNotAgent(user);
  const leads = await prisma.lead.count({ where: { unitTypeId: unit.id } });
  if (leads > 0) {
    throw new ApiError(409, `אי אפשר למחוק: ${leads} לידים מקושרים לטיפוס הזה`);
  }
  await prisma.unitType.delete({ where: { id: unit.id } });
  return NextResponse.json({ ok: true });
});
