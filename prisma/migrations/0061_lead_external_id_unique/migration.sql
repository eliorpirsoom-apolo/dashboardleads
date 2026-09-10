-- ייחודיות clientId+externalId ללידים: מונעת שני לידים מאותו ליד מטא/שיחה
-- כשוובהוק כפול, המסלול המיידי והמשיכה המחזורית מגיעים באותה שנייה (תנאי
-- מרוץ שנתפס 10.9 אחרי המעבר ל-Live). אינדקס חלקי — לידים בלי externalId
-- (ידני/ייבוא/דפי נחיתה) אינם מוגבלים. כפילויות היסטוריות מקבלות סיומת
-- כדי שהאינדקס ייבנה; אידמפוטנטי לריצה חוזרת.
UPDATE "Lead" l
SET "externalId" = l."externalId" || '#dup' || substr(l."id", 1, 6)
WHERE l."externalId" IS NOT NULL
  AND l."externalId" NOT LIKE '%#dup%'
  AND EXISTS (
    SELECT 1 FROM "Lead" o
    WHERE o."clientId" = l."clientId"
      AND o."externalId" = l."externalId"
      AND (o."createdAt" < l."createdAt" OR (o."createdAt" = l."createdAt" AND o."id" < l."id"))
  );

CREATE UNIQUE INDEX IF NOT EXISTS "Lead_clientId_externalId_key"
  ON "Lead"("clientId", "externalId")
  WHERE "externalId" IS NOT NULL;
