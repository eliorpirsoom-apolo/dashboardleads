-- AlterTable: שיחת וואטסאפ מול ליד — שרשור הודעות לליד ספציפי
ALTER TABLE "WhatsappMessage" ADD COLUMN     "leadId" TEXT;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "WhatsappMessage_leadId_createdAt_idx" ON "WhatsappMessage"("leadId", "createdAt");
