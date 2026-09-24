-- מודול סיכומי פגישות + מזהה קבוצת וואטסאפ ללקוח. אידמפוטנטי (ריצה חוזרת בטוחה).
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "whatsappGroupChatId" TEXT;

CREATE TABLE IF NOT EXISTS "MeetingSummary" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "projectId" TEXT,
  "title" TEXT NOT NULL,
  "meetingDate" TIMESTAMP(3) NOT NULL,
  "rawText" TEXT,
  "bullets" TEXT,
  "photoKeys" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "createdById" TEXT,
  "sentToClientAt" TIMESTAMP(3),
  "sentChatId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingSummary_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MeetingSummary_clientId_meetingDate_idx" ON "MeetingSummary"("clientId", "meetingDate");
CREATE INDEX IF NOT EXISTS "MeetingSummary_status_idx" ON "MeetingSummary"("status");

-- FK ללקoח (guarded — לא נופל אם כבר קיים)
DO $$ BEGIN
  ALTER TABLE "MeetingSummary" ADD CONSTRAINT "MeetingSummary_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
