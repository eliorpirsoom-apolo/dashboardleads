-- מודול קידום אורגני: פעולות SEO פר לקוח + מכסה חודשית.

CREATE TABLE "SeoAction" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "targetPage" TEXT,
    "anchor" TEXT,
    "cost" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "doneAt" TIMESTAMP(3),
    "assigneeId" TEXT,
    "notes" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SeoAction_clientId_month_idx" ON "SeoAction"("clientId", "month");
CREATE INDEX "SeoAction_month_kind_idx" ON "SeoAction"("month", "kind");

ALTER TABLE "SeoAction" ADD CONSTRAINT "SeoAction_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeoAction" ADD CONSTRAINT "SeoAction_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SeoQuota" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "links" INTEGER NOT NULL DEFAULT 0,
    "content" INTEGER NOT NULL DEFAULT 0,
    "onsite" INTEGER NOT NULL DEFAULT 0,
    "updates" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoQuota_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeoQuota_clientId_key" ON "SeoQuota"("clientId");

ALTER TABLE "SeoQuota" ADD CONSTRAINT "SeoQuota_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
