-- Internal duplicate flag — decouples "duplicate" from the lead's status.
-- The captured lead keeps its "new" status; duplication is shown only INSIDE
-- the lead card (an internal badge), never as a board column.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "isDuplicate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "duplicateOfNumber" INTEGER;

-- Backfill is deliberately conservative. We only touch a lead when ALL hold:
--   * it is received in the LAST 5 DAYS (older handled duplicates are left alone);
--   * it was auto-marked "כפול" by the SYSTEM ("מערכת" status activity);
--   * NO human ever changed its status (any non-"מערכת" status activity → skip).
-- This guarantees we never override a status a salesperson set by hand.

-- 1) flag the eligible recent ones internally (status is still "כפול" here).
UPDATE "Lead" l
SET "isDuplicate" = true
WHERE l."statusId" IN (SELECT "id" FROM "LeadStatus" WHERE "systemKind" = 'duplicate')
  AND l."receivedAt" >= NOW() - INTERVAL '5 days'
  AND EXISTS (
    SELECT 1 FROM "LeadActivity" a
    WHERE a."leadId" = l."id" AND a."kind" = 'status'
      AND a."actorName" = 'מערכת' AND a."toValue" = 'כפול'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "LeadActivity" h
    WHERE h."leadId" = l."id" AND h."kind" = 'status' AND h."actorName" <> 'מערכת'
  );

-- 2) move those same eligible leads back to the client's default ("new") status.
UPDATE "Lead" l
SET "statusId" = (
  SELECT ds."id" FROM "LeadStatus" ds
  WHERE ds."clientId" = l."clientId" AND ds."isDefault" = true
  ORDER BY ds."order" ASC
  LIMIT 1
)
WHERE l."statusId" IN (SELECT "id" FROM "LeadStatus" WHERE "systemKind" = 'duplicate')
  AND l."receivedAt" >= NOW() - INTERVAL '5 days'
  AND EXISTS (
    SELECT 1 FROM "LeadActivity" a
    WHERE a."leadId" = l."id" AND a."kind" = 'status'
      AND a."actorName" = 'מערכת' AND a."toValue" = 'כפול'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "LeadActivity" h
    WHERE h."leadId" = l."id" AND h."kind" = 'status' AND h."actorName" <> 'מערכת'
  )
  AND EXISTS (
    SELECT 1 FROM "LeadStatus" ds2
    WHERE ds2."clientId" = l."clientId" AND ds2."isDefault" = true
  );

-- 3) remove a "duplicate" status column ONLY when it is now completely empty
--    and unreferenced (no leads, no automations). Columns that still hold older
--    or human-assigned duplicates are left in place.
DELETE FROM "LeadStatus" s
WHERE s."systemKind" = 'duplicate'
  AND NOT EXISTS (SELECT 1 FROM "Lead" x WHERE x."statusId" = s."id")
  AND NOT EXISTS (SELECT 1 FROM "Automation" a WHERE a."statusId" = s."id");
