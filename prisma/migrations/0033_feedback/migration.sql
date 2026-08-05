-- CreateTable: משוב עובדים על המערכת
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'improvement',
    "text" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_resolved_createdAt_idx" ON "Feedback"("resolved", "createdAt");
