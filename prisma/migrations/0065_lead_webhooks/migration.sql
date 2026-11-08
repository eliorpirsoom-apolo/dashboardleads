-- שיגור לידים החוצה: יעדי webhook פר-לקוח/פרויקט + יומן מסירה. אידמפוטנטי.
CREATE TABLE IF NOT EXISTS "LeadWebhook" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "projectId" TEXT,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'POST',
  "format" TEXT NOT NULL DEFAULT 'json',
  "authHeader" TEXT,
  "authValue" TEXT,
  "secret" TEXT,
  "fieldMap" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastStatus" TEXT,
  "lastError" TEXT,
  "lastSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadWebhook_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LeadWebhook_clientId_idx" ON "LeadWebhook"("clientId");
CREATE INDEX IF NOT EXISTS "LeadWebhook_projectId_idx" ON "LeadWebhook"("projectId");
DO $$ BEGIN
  ALTER TABLE "LeadWebhook" ADD CONSTRAINT "LeadWebhook_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LeadWebhook" ADD CONSTRAINT "LeadWebhook_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "LeadForwardLog" (
  "id" TEXT NOT NULL,
  "webhookId" TEXT NOT NULL,
  "leadId" TEXT,
  "status" TEXT NOT NULL,
  "httpCode" INTEGER,
  "error" TEXT,
  "requestBody" TEXT,
  "responseBody" TEXT,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadForwardLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LeadForwardLog_webhookId_createdAt_idx" ON "LeadForwardLog"("webhookId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadForwardLog_leadId_idx" ON "LeadForwardLog"("leadId");
DO $$ BEGIN
  ALTER TABLE "LeadForwardLog" ADD CONSTRAINT "LeadForwardLog_webhookId_fkey"
    FOREIGN KEY ("webhookId") REFERENCES "LeadWebhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
