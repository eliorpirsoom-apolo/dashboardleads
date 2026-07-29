-- CreateTable
CREATE TABLE "DesignTask" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "briefType" TEXT NOT NULL DEFAULT 'post',
    "brief" TEXT,
    "specs" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "designerId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "round" INTEGER NOT NULL DEFAULT 1,
    "overdue" BOOLEAN NOT NULL DEFAULT false,
    "qcById" TEXT,
    "qcAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "clientNotifiedAt" TIMESTAMP(3),
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignAsset" (
    "id" TEXT NOT NULL,
    "designTaskId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "fileKey" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "note" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignFeedback" (
    "id" TEXT NOT NULL,
    "designTaskId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "decision" TEXT NOT NULL,
    "text" TEXT,
    "authorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignTask_status_idx" ON "DesignTask"("status");

-- CreateIndex
CREATE INDEX "DesignTask_designerId_scheduledAt_idx" ON "DesignTask"("designerId", "scheduledAt");

-- CreateIndex
CREATE INDEX "DesignTask_clientId_idx" ON "DesignTask"("clientId");

-- CreateIndex
CREATE INDEX "DesignAsset_designTaskId_idx" ON "DesignAsset"("designTaskId");

-- CreateIndex
CREATE INDEX "DesignFeedback_designTaskId_idx" ON "DesignFeedback"("designTaskId");

-- AddForeignKey
ALTER TABLE "DesignTask" ADD CONSTRAINT "DesignTask_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignTask" ADD CONSTRAINT "DesignTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignTask" ADD CONSTRAINT "DesignTask_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignTask" ADD CONSTRAINT "DesignTask_qcById_fkey" FOREIGN KEY ("qcById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignTask" ADD CONSTRAINT "DesignTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignAsset" ADD CONSTRAINT "DesignAsset_designTaskId_fkey" FOREIGN KEY ("designTaskId") REFERENCES "DesignTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignAsset" ADD CONSTRAINT "DesignAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignFeedback" ADD CONSTRAINT "DesignFeedback_designTaskId_fkey" FOREIGN KEY ("designTaskId") REFERENCES "DesignTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
