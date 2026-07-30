-- AlterTable
ALTER TABLE "DesignAsset" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'deliverable';
ALTER TABLE "DesignAsset" ADD COLUMN     "feedbackId" TEXT;
