-- AlterTable: Speed-to-Lead — מעקב טיפול ראשון + חותמות תזכורות
ALTER TABLE "Lead" ADD COLUMN     "firstHandledAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN     "slaMarketerRemindedAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN     "slaEscalatedAt" TIMESTAMP(3);

-- AlterTable: הגדרות SLA (סוכנות)
ALTER TABLE "AiAgentConfig" ADD COLUMN     "slaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiAgentConfig" ADD COLUMN     "slaMarketerMinutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "AiAgentConfig" ADD COLUMN     "slaEscalateMinutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "AiAgentConfig" ADD COLUMN     "slaWorkStart" TEXT NOT NULL DEFAULT '08:00';
ALTER TABLE "AiAgentConfig" ADD COLUMN     "slaWorkEnd" TEXT NOT NULL DEFAULT '20:00';
