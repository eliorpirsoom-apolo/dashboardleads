-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "sumitCustomerId" INTEGER;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalUrl" TEXT,
ADD COLUMN     "provider" TEXT,
ALTER COLUMN "fileKey" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Document_provider_externalId_key" ON "Document"("provider", "externalId");

