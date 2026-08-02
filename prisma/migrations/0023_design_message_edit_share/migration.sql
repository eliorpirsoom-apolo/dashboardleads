-- AlterTable
ALTER TABLE "DesignMessage" ADD COLUMN     "editedAt" TIMESTAMP(3);
ALTER TABLE "DesignMessage" ADD COLUMN     "sharedChannels" TEXT;
ALTER TABLE "DesignMessage" ADD COLUMN     "sharedAt" TIMESTAMP(3);
