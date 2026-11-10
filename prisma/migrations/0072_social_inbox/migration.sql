-- תיבת מענה חברתי (Social Inbox) — שלב 1a: קליטת תגובות/הודעות מדפי
-- פייסבוק/אינסטגרם ותצוגה בדשבורד. מפרט: SOCIAL_INBOX_PLAN.md. אידמפוטנטי.

-- דף עסקי שמחובר לתיבת המענה (נפרד מ-MetaPage של הלידים). הטוקן מוצפן.
CREATE TABLE IF NOT EXISTS "SocialAccount" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'facebook',
  "pageId" TEXT NOT NULL,
  "pageName" TEXT NOT NULL,
  "igUserId" TEXT,
  "igUsername" TEXT,
  "pageTokenEnc" TEXT NOT NULL,
  "tokenValid" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastError" TEXT,
  "lastEventAt" TIMESTAMP(3),
  "connectedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SocialAccount_pageId_key" ON "SocialAccount"("pageId");
CREATE INDEX IF NOT EXISTS "SocialAccount_clientId_idx" ON "SocialAccount"("clientId");
CREATE INDEX IF NOT EXISTS "SocialAccount_igUserId_idx" ON "SocialAccount"("igUserId");
DO $$ BEGIN
  ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- פנייה אחת: שרשור תגובה (תגובת שורש + תשובות) או שיחת DM.
CREATE TABLE IF NOT EXISTS "SocialThread" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "postId" TEXT,
  "permalink" TEXT,
  "authorName" TEXT,
  "authorExtId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "draftText" TEXT,
  "draftAt" TIMESTAMP(3),
  "needsHuman" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "lastInboundAt" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "snippet" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialThread_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SocialThread_accountId_kind_externalId_key"
  ON "SocialThread"("accountId", "kind", "externalId");
CREATE INDEX IF NOT EXISTS "SocialThread_clientId_lastMessageAt_idx" ON "SocialThread"("clientId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "SocialThread_status_idx" ON "SocialThread"("status");
DO $$ BEGIN
  ALTER TABLE "SocialThread" ADD CONSTRAINT "SocialThread_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SocialThread" ADD CONSTRAINT "SocialThread_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- הודעה בודדת בשרשור. externalId (comment_id / mid) ייחודי בשרשור — דדופ.
CREATE TABLE IF NOT EXISTS "SocialMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "externalId" TEXT,
  "text" TEXT NOT NULL,
  "authorName" TEXT,
  "authorExtId" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SocialMessage_threadId_externalId_key" ON "SocialMessage"("threadId", "externalId");
CREATE INDEX IF NOT EXISTS "SocialMessage_threadId_createdAt_idx" ON "SocialMessage"("threadId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "SocialMessage" ADD CONSTRAINT "SocialMessage_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "SocialThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- מאגר ידע פר-לקוח להנחיית ה-AI (טבלה בלבד בשלב 1a; עורך בשלב 1b).
CREATE TABLE IF NOT EXISTS "SocialKnowledge" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "faq" TEXT,
  "pricing" TEXT,
  "tone" TEXT,
  "doNotAnswer" TEXT,
  "escalate" TEXT,
  "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialKnowledge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SocialKnowledge_clientId_key" ON "SocialKnowledge"("clientId");
DO $$ BEGIN
  ALTER TABLE "SocialKnowledge" ADD CONSTRAINT "SocialKnowledge_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
