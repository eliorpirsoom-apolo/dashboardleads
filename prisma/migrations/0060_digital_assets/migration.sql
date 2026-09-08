-- מרשם נכסים דיגיטליים: ביזנס מנג'רים / דפים / חשבונות מודעות פר לקוח.
-- כתוב אידמפוטנטית (IF NOT EXISTS) כדי שריצה חוזרת אחרי כשל חלקי לא תיפול.
CREATE TABLE IF NOT EXISTS "DigitalAsset" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT,
  "externalId" TEXT,
  "ownership" TEXT NOT NULL DEFAULT 'client',
  "ownerNote" TEXT,
  "access" TEXT NOT NULL DEFAULT 'none',
  "accessUsers" TEXT,
  "role" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DigitalAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DigitalAsset_clientId_kind_idx" ON "DigitalAsset"("clientId", "kind");

DO $$ BEGIN
  ALTER TABLE "DigitalAsset"
    ADD CONSTRAINT "DigitalAsset_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
