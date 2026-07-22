-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "company" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "quoteId" TEXT,
    "title" TEXT NOT NULL,
    "kickoffAt" TIMESTAMP(3),
    "kickoffDone" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementTask" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assigneeId" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GanttPlan" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "startMonth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GanttPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GanttTask" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerName" TEXT,
    "color" TEXT NOT NULL DEFAULT '#22d3ee',
    "order" INTEGER NOT NULL DEFAULT 0,
    "weeks" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GanttTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_quoteId_key" ON "Engagement"("quoteId");

-- CreateIndex
CREATE INDEX "Engagement_status_createdAt_idx" ON "Engagement"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EngagementTask_engagementId_idx" ON "EngagementTask"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "GanttPlan_clientId_key" ON "GanttPlan"("clientId");

-- CreateIndex
CREATE INDEX "GanttTask_planId_idx" ON "GanttTask"("planId");

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementTask" ADD CONSTRAINT "EngagementTask_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementTask" ADD CONSTRAINT "EngagementTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GanttPlan" ADD CONSTRAINT "GanttPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GanttTask" ADD CONSTRAINT "GanttTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "GanttPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

