-- AlterTable: מתג ראשי לשיחות וואטסאפ עם לידים (כבוי כברירת מחדל)
ALTER TABLE "AiAgentConfig" ADD COLUMN     "leadChatEnabled" BOOLEAN NOT NULL DEFAULT false;
