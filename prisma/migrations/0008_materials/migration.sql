-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "materialsLastRemindedAt" TIMESTAMP(3),
ADD COLUMN     "materialsReceived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "materialsReceivedAt" TIMESTAMP(3),
ADD COLUMN     "materialsRemindersSent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "materialsRequestedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProjectMaterial" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "received" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" TEXT NOT NULL DEFAULT '[]',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectMaterial_projectId_idx" ON "ProjectMaterial"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialTemplate_name_key" ON "MaterialTemplate"("name");

-- CreateIndex
CREATE INDEX "Project_materialsReceived_materialsRequestedAt_idx" ON "Project"("materialsReceived", "materialsRequestedAt");

-- AddForeignKey
ALTER TABLE "ProjectMaterial" ADD CONSTRAINT "ProjectMaterial_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

