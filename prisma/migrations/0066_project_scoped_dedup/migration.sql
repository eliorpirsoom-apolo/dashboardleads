-- "כל פרויקט בפני עצמו": externalId ייחודי פר (לקוח, פרויקט) במקום פר-לקוח,
-- כדי ששני פרויקטים של אותו לקוח שמקבלים externalId גנרי זהה (למשל id=1 משני
-- דפי נחיתה) לא ימוזגו לליד אחד. (clientId,externalId) היה ייחודי → המפתח
-- הרחב (clientId,projectId,externalId) ייחודי מובטח, כך שבנייתו לא תיכשל.
DROP INDEX IF EXISTS "Lead_clientId_externalId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_clientId_projectId_externalId_key"
  ON "Lead"("clientId", "projectId", "externalId")
  WHERE "externalId" IS NOT NULL;
