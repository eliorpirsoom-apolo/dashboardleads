-- CreateTable: מעקב חשבוניות SUMIT שהוחלו על לוח התשלומים (אידמפוטנטיות)
CREATE TABLE "SumitInvoice" (
    "documentID" INTEGER NOT NULL,
    "clientId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "retainer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oneoff" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SumitInvoice_pkey" PRIMARY KEY ("documentID")
);

-- CreateIndex
CREATE INDEX "SumitInvoice_clientId_year_month_idx" ON "SumitInvoice"("clientId", "year", "month");
