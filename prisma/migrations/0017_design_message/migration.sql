-- CreateTable
CREATE TABLE "DesignMessage" (
    "id" TEXT NOT NULL,
    "designTaskId" TEXT NOT NULL,
    "authorSide" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignMessage_designTaskId_idx" ON "DesignMessage"("designTaskId");

-- AddForeignKey
ALTER TABLE "DesignMessage" ADD CONSTRAINT "DesignMessage_designTaskId_fkey" FOREIGN KEY ("designTaskId") REFERENCES "DesignTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
