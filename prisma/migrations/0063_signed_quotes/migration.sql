-- הצעות מחיר חתומות פר-לקוח (גלוי למנהלים בלבד). אידמפוטנטי.
CREATE TABLE IF NOT EXISTS "SignedQuote" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "fileKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignedQuote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SignedQuote_clientId_createdAt_idx" ON "SignedQuote"("clientId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "SignedQuote" ADD CONSTRAINT "SignedQuote_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
