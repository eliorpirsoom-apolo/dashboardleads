-- רשימת השבוע — דף משימות שבועי משותף למשרד (שלב א׳). אידמפוטנטי.
CREATE TABLE IF NOT EXISTS "WeeklyTask" (
  "id" TEXT NOT NULL,
  "weekStart" TIMESTAMP(3) NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'misc',
  "clientId" TEXT,
  "projectId" TEXT,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "at" TIMESTAMP(3),
  "done" BOOLEAN NOT NULL DEFAULT false,
  "doneAt" TIMESTAMP(3),
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdByName" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WeeklyTask_weekStart_category_orderIndex_idx" ON "WeeklyTask"("weekStart", "category", "orderIndex");
CREATE INDEX IF NOT EXISTS "WeeklyTask_clientId_idx" ON "WeeklyTask"("clientId");
CREATE INDEX IF NOT EXISTS "WeeklyTask_projectId_idx" ON "WeeklyTask"("projectId");
CREATE INDEX IF NOT EXISTS "WeeklyTask_done_idx" ON "WeeklyTask"("done");
DO $$ BEGIN
  ALTER TABLE "WeeklyTask" ADD CONSTRAINT "WeeklyTask_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WeeklyTask" ADD CONSTRAINT "WeeklyTask_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
