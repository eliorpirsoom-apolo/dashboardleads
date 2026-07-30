-- AlterTable
ALTER TABLE "DesignTask" ADD COLUMN     "approvalToken" TEXT;
ALTER TABLE "DesignMessage" ADD COLUMN     "assetId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DesignTask_approvalToken_key" ON "DesignTask"("approvalToken");
