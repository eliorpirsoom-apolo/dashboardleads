-- אוטומציות ללקוח הפונה (הליד עצמו): סינון לפי סוג ליד, מדיה מצורפת, וקירור.
ALTER TABLE "Automation" ADD COLUMN "leadKind" TEXT;
ALTER TABLE "Automation" ADD COLUMN "mediaKey" TEXT;
ALTER TABLE "Automation" ADD COLUMN "mediaName" TEXT;
ALTER TABLE "Automation" ADD COLUMN "mediaMime" TEXT;
ALTER TABLE "Automation" ADD COLUMN "cooldownHours" INTEGER;

ALTER TABLE "Message" ADD COLUMN "automationId" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaKey" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaName" TEXT;
CREATE INDEX "Message_automationId_to_createdAt_idx" ON "Message"("automationId", "to", "createdAt");
