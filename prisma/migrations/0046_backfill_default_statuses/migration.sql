-- לקוחות שנוצרו אוטומטית (SUMIT) בלי סטטוסי ברירת מחדל: הלידים שלהם קיבלו
-- את הסטטוס היחיד שהיה קיים ("בקשת רכישה" מהמיגרציה 0043). משלימים את הסט
-- המלא ומחזירים את הלידים שנפלו לפולבק השגוי ל"חדש".

CREATE TEMP TABLE broken_clients AS
SELECT c.id FROM "Client" c
WHERE NOT EXISTS (
  SELECT 1 FROM "LeadStatus" s WHERE s."clientId" = c.id AND s."isDefault" = true
);

INSERT INTO "LeadStatus" ("id", "clientId", "name", "color", "order", "systemKind", "isDefault", "createdAt")
SELECT gen_random_uuid()::text, b.id, v.name, v.color, v.ord, v.kind, v.isdef, NOW()
FROM broken_clients b
CROSS JOIN (VALUES
  ('חדש', '#38bdf8', 0, 'new', true),
  ('בטיפול', '#f59e0b', 1, 'in_progress', false),
  ('נקבעה פגישה', '#a78bfa', 2, 'in_progress', false),
  ('עסקה', '#34d399', 4, 'won', false),
  ('אבוד', '#f87171', 5, 'lost', false)
) AS v(name, color, ord, kind, isdef)
WHERE NOT EXISTS (
  SELECT 1 FROM "LeadStatus" s WHERE s."clientId" = b.id AND s."name" = v.name
);

UPDATE "Lead" l
SET "statusId" = (
  SELECT s2.id FROM "LeadStatus" s2
  WHERE s2."clientId" = l."clientId" AND s2."name" = 'חדש'
  LIMIT 1
)
WHERE l."clientId" IN (SELECT id FROM broken_clients)
  AND l."statusId" IN (SELECT s3.id FROM "LeadStatus" s3 WHERE s3."name" = 'בקשת רכישה');

DROP TABLE broken_clients;
