-- AlterTable: מתג לתקציר הבוקר היומי (כבוי כברירת מחדל — לבקשת המשרד)
ALTER TABLE "AiAgentConfig" ADD COLUMN     "morningDigestEnabled" BOOLEAN NOT NULL DEFAULT false;
