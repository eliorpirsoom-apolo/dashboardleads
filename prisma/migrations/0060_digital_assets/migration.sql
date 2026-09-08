-- מרשם נכסים דיגיטליים: ביזנס מנג'רים / דפים / חשבונות מודעות פר לקוח —
-- בעלות, גישה, משתמשים מחוברים.
CREATE TABLE "DigitalAsset" (
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
  CONSTRAINT "DigitalAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DigitalAsset_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DigitalAsset_clientId_kind_idx" ON "DigitalAsset"("clientId", "kind");
