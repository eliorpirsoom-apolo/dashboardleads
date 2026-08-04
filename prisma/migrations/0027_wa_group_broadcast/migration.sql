-- AlterTable
ALTER TABLE "AiAgentConfig" ADD COLUMN     "broadcastEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiAgentConfig" ADD COLUMN     "morningTime" TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE "AiAgentConfig" ADD COLUMN     "morningText" TEXT NOT NULL DEFAULT 'בוקר טוב לכולם ☀️';
ALTER TABLE "AiAgentConfig" ADD COLUMN     "eodTime" TEXT NOT NULL DEFAULT '17:00';
ALTER TABLE "AiAgentConfig" ADD COLUMN     "eodText" TEXT NOT NULL DEFAULT 'היי כולם, אנחנו תכף מסיימים את היום — יש בקשות / הערות?';
ALTER TABLE "AiAgentConfig" ADD COLUMN     "broadcastDays" TEXT NOT NULL DEFAULT '0,1,2,3,4';
ALTER TABLE "AiAgentConfig" ADD COLUMN     "lastMorningSentOn" TEXT;
ALTER TABLE "AiAgentConfig" ADD COLUMN     "lastEodSentOn" TEXT;
