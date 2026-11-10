-- תוצרים סופיים של יום צילום — קובץ (R2) או קישור חיצוני. אידמפוטנטי.
CREATE TABLE IF NOT EXISTS "ShootAsset" (
  "id" TEXT NOT NULL,
  "shootId" TEXT NOT NULL,
  "fileKey" TEXT,
  "url" TEXT,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT,
  "size" INTEGER,
  "note" TEXT,
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShootAsset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ShootAsset_shootId_idx" ON "ShootAsset"("shootId");
DO $$ BEGIN
  ALTER TABLE "ShootAsset" ADD CONSTRAINT "ShootAsset_shootId_fkey"
    FOREIGN KEY ("shootId") REFERENCES "ShootDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ShootAsset" ADD CONSTRAINT "ShootAsset_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
