-- CreateTable
CREATE TABLE "TaskInbox" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inbox',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceRef" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "convertedTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskInbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskInbox_status_createdAt_idx" ON "TaskInbox"("status", "createdAt");
