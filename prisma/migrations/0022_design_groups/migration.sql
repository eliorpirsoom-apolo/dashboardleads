-- CreateTable
CREATE TABLE "DesignGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignGroup_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "DesignTask" ADD COLUMN     "groupId" TEXT;
ALTER TABLE "DesignTask" ADD COLUMN     "orderIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "DesignTask_groupId_orderIndex_idx" ON "DesignTask"("groupId", "orderIndex");

-- AddForeignKey
ALTER TABLE "DesignTask" ADD CONSTRAINT "DesignTask_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DesignGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
