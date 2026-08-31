-- זימוני צוות: עותק משימה לכל משתתף/ת (teamKey משותף) + קבוצת הוואטסאפ של
-- המשרד להודעות ותזכורות.
ALTER TABLE "Task" ADD COLUMN "teamKey" TEXT;
CREATE INDEX "Task_teamKey_idx" ON "Task"("teamKey");
ALTER TABLE "AiAgentConfig" ADD COLUMN "officeGroupChatId" TEXT;
ALTER TABLE "AiAgentConfig" ADD COLUMN "officeGroupName" TEXT;
