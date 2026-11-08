-- ימי צילום — מודול פנימי למשרד. אידמפוטנטי.
CREATE TABLE IF NOT EXISTS "ShootDay" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "projectId" TEXT,
  "title" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3),
  "location" TEXT,
  "types" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "equipment" TEXT,
  "deliverables" TEXT,
  "cost" DOUBLE PRECISION,
  "notes" TEXT,
  "gcalEventId" TEXT,
  "reminderSent" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShootDay_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ShootDay_clientId_idx" ON "ShootDay"("clientId");
CREATE INDEX IF NOT EXISTS "ShootDay_date_idx" ON "ShootDay"("date");
CREATE INDEX IF NOT EXISTS "ShootDay_status_idx" ON "ShootDay"("status");
DO $$ BEGIN
  ALTER TABLE "ShootDay" ADD CONSTRAINT "ShootDay_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ShootDay" ADD CONSTRAINT "ShootDay_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ShootCrew" (
  "id" TEXT NOT NULL,
  "shootId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT,
  CONSTRAINT "ShootCrew_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShootCrew_shootId_userId_key" ON "ShootCrew"("shootId", "userId");
CREATE INDEX IF NOT EXISTS "ShootCrew_userId_idx" ON "ShootCrew"("userId");
DO $$ BEGIN
  ALTER TABLE "ShootCrew" ADD CONSTRAINT "ShootCrew_shootId_fkey"
    FOREIGN KEY ("shootId") REFERENCES "ShootDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ShootCrew" ADD CONSTRAINT "ShootCrew_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
