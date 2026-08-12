-- מסמכי ליד: ת"ז, בקשת רכישה, חוזה — מקושרים לכרטיס הליד.
ALTER TABLE "Document" ADD COLUMN "leadId" TEXT;
ALTER TABLE "Document" ADD CONSTRAINT "Document_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Document_leadId_idx" ON "Document"("leadId");

-- סטטוס "בקשת רכישה" לכל לקוח קיים שאין לו — נכנס למקום 3 (אחרי "נקבעה פגישה").
UPDATE "LeadStatus" SET "order" = "order" + 1
WHERE "order" >= 3 AND "clientId" IN (
  SELECT c.id FROM "Client" c WHERE NOT EXISTS (
    SELECT 1 FROM "LeadStatus" s WHERE s."clientId" = c.id AND s."name" = 'בקשת רכישה'
  )
);
INSERT INTO "LeadStatus" ("id", "clientId", "name", "color", "order", "systemKind", "isDefault", "createdAt")
SELECT gen_random_uuid()::text, c.id, 'בקשת רכישה', '#fb923c', 3, 'in_progress', false, NOW()
FROM "Client" c
WHERE NOT EXISTS (
  SELECT 1 FROM "LeadStatus" s WHERE s."clientId" = c.id AND s."name" = 'בקשת רכישה'
);
