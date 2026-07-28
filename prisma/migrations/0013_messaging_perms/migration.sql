-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "messagingConfig" TEXT;

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "target" TEXT NOT NULL DEFAULT 'agent';
