-- חיבור ישיר ל-Meta: עמודי פייסבוק מחוברים (Lead Ads → וובהוק → קליטה).
CREATE TABLE "MetaPage" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "sourceId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "pageToken" TEXT NOT NULL,
    "connectedById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLeadAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaPage_sourceId_key" ON "MetaPage"("sourceId");
CREATE UNIQUE INDEX "MetaPage_pageId_key" ON "MetaPage"("pageId");
CREATE INDEX "MetaPage_clientId_idx" ON "MetaPage"("clientId");

ALTER TABLE "MetaPage" ADD CONSTRAINT "MetaPage_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaPage" ADD CONSTRAINT "MetaPage_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MetaPage" ADD CONSTRAINT "MetaPage_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "LeadSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
