// ============================================================================
// ייבוא לידים מהמערכת הישנה (הסקרייפר של ליד מנג'ר) למבנה החדש.
//
// הדאטה הישן שמור ב-prisma/legacy-leadmanager.db (גובה אוטומטית לפני המעבר).
// הרצה — משייכים את כל הלידים הישנים ללקוח קיים לפי שמו במערכת:
//
//   node --experimental-sqlite scripts/import-legacy.mjs "נופי השרון נדל\"ן"
//
// בטוח להרצה חוזרת: לידים עם אותו externalId מדולגים.
// ============================================================================

import "dotenv/config";
import path from "node:path";
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const clientName = process.argv[2];
if (!clientName) {
  console.error('שימוש: node --experimental-sqlite scripts/import-legacy.mjs "<שם הלקוח>"');
  process.exit(1);
}

let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  console.error("נדרש דגל: node --experimental-sqlite scripts/import-legacy.mjs ...");
  process.exit(1);
}

const legacyPath = path.join(process.cwd(), "prisma", "legacy-leadmanager.db");
if (!existsSync(legacyPath)) {
  console.error(`לא נמצא DB ישן ב-${legacyPath}`);
  process.exit(1);
}

const prisma = new PrismaClient();
const legacy = new DatabaseSync(legacyPath, { readOnly: true });

const client = await prisma.client.findUnique({ where: { name: clientName } });
if (!client) {
  console.error(`לקוח "${clientName}" לא נמצא במערכת החדשה — צרו אותו קודם`);
  process.exit(1);
}

const defaultStatus = await prisma.leadStatus.findFirst({
  where: { clientId: client.id },
  orderBy: [{ isDefault: "desc" }, { order: "asc" }],
});

const rows = legacy.prepare("SELECT * FROM Lead").all();
console.log(`נמצאו ${rows.length} לידים ישנים. מייבא ללקוח "${client.name}"…`);

let imported = 0;
let skipped = 0;

// Map old status text to a matching new status by name when possible.
const statuses = await prisma.leadStatus.findMany({ where: { clientId: client.id } });
const statusByName = new Map(statuses.map((s) => [s.name, s.id]));

let nextNumber =
  ((await prisma.lead.findFirst({
    where: { clientId: client.id },
    orderBy: { number: "desc" },
    select: { number: true },
  }))?.number ?? 0) + 1;

for (const row of rows) {
  const externalId = row.externalId ? `legacy-${row.externalId}` : null;
  if (externalId) {
    const exists = await prisma.lead.findUnique({ where: { externalId } });
    if (exists) {
      skipped++;
      continue;
    }
  }

  await prisma.lead.create({
    data: {
      clientId: client.id,
      number: nextNumber++,
      externalId,
      kind: "form",
      statusId: statusByName.get(row.status) ?? defaultStatus?.id ?? null,
      fullName: row.fullName ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      city: row.city ?? null,
      channel: row.channel ? String(row.channel).toLowerCase() : null,
      campaignLabel: row.campaignLabel ?? null,
      consent: false, // הסכמה לא נאספה במערכת הישנה — ברירת מחדל שמרנית
      receivedAt: row.receivedAt ? new Date(row.receivedAt) : new Date(row.createdAt),
      data: row.data ?? null,
    },
  });
  imported++;
}

console.log(`יובאו ${imported} לידים, דולגו ${skipped} (כבר קיימים).`);
await prisma.$disconnect();
