-- תיבת מענה חברתי — שלב 1b (טיוטות AI). אידמפוטנטי.
-- SocialThread: סיבת כשל ביצירת טיוטה + קטגוריית הפנייה לפי ה-AI.
ALTER TABLE "SocialThread" ADD COLUMN IF NOT EXISTS "draftError" TEXT;
ALTER TABLE "SocialThread" ADD COLUMN IF NOT EXISTS "aiCategory" TEXT;
-- SocialKnowledge: תיאור העסק (הבסיס לכל תשובה).
ALTER TABLE "SocialKnowledge" ADD COLUMN IF NOT EXISTS "about" TEXT;
