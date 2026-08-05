-- AlterTable: קבוצות שהוחרגו מבוט התפוצה (JSON של chatIds; ריק = כל הקבוצות)
ALTER TABLE "AiAgentConfig" ADD COLUMN     "broadcastExcludeGroups" TEXT;
