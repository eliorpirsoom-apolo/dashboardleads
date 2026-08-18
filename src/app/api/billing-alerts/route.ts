import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";
import { getBillingConfig, processBillingAlerts } from "@/lib/billingAlerts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function guard() {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "payments")) throw new ApiError(403, "אין הרשאה למודול התשלומים");
  return user;
}

// GET — הגדרות ההתראות + התזכורות (פתוחות ואחרונות שנשלחו).
export const GET = handle(async () => {
  await guard();
  const [config, reminders] = await Promise.all([
    getBillingConfig(),
    prisma.billingReminder.findMany({ orderBy: [{ sentAt: "asc" }, { dueOn: "asc" }], take: 60 }),
  ]);
  return NextResponse.json({ config, reminders });
});

const UpdateConfig = z.object({
  enabled: z.boolean().optional(),
  contactPhone: z.string().max(30).nullable().optional(),
  contactEmail: z.string().max(120).nullable().optional(),
  channel: z.enum(["whatsapp", "email", "both"]).optional(),
  alertDay: z.number().int().min(1).max(28).optional(),
});

// PATCH — עדכון ההגדרות.
export const PATCH = handle(async (req) => {
  await guard();
  const b = UpdateConfig.parse(await readJson(req));
  const cur = await getBillingConfig();
  const data: Record<string, unknown> = {};
  if (b.enabled !== undefined) data.enabled = b.enabled;
  if (b.contactPhone !== undefined) data.contactPhone = b.contactPhone?.trim() || null;
  if (b.contactEmail !== undefined) data.contactEmail = b.contactEmail?.trim() || null;
  if (b.channel !== undefined) data.channel = b.channel;
  if (b.alertDay !== undefined) data.alertDay = b.alertDay;
  const config = await prisma.billingAlertConfig.update({ where: { id: cur.id }, data });
  return NextResponse.json({ config });
});

const NewReminder = z.object({
  text: z.string().min(1, "טקסט ריק").max(500),
  dueOn: z.string().min(8), // YYYY-MM-DD
  test: z.undefined().optional(),
});

// POST — תזכורת חדשה, או {test:true} לשליחת בדיקה מיידית (כולל דוח אי-תשלום).
export const POST = handle(async (req) => {
  const user = await guard();
  const raw = await readJson(req);
  if ((raw as any)?.test === true) {
    const result = await processBillingAlerts(true);
    return NextResponse.json({ ok: true, result });
  }
  const b = NewReminder.parse(raw);
  const due = new Date(`${b.dueOn}T00:00:00+03:00`);
  if (isNaN(due.getTime())) throw new ApiError(400, "תאריך לא תקין");
  const reminder = await prisma.billingReminder.create({
    data: { text: b.text.trim(), dueOn: due, createdByName: user.name },
  });
  return NextResponse.json({ reminder }, { status: 201 });
});
