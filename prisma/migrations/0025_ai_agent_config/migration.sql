-- CreateTable
CREATE TABLE "AiAgentConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'task-capture',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "allowedNumbers" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT,
    "model" TEXT,
    "replyConfirm" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentConfig_key_key" ON "AiAgentConfig"("key");
