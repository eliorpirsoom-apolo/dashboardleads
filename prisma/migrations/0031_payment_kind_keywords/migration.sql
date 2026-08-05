-- AlterTable: הוספת סוג תשלום (ריטיינר/חד-פעמי) עם ברירת מחדל ריטיינר לשורות קיימות
ALTER TABLE "ClientPayment" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'retainer';

-- החלפת המפתח הייחודי כך שיכלול את הסוג (שורה נפרדת לכל סוג באותו חודש)
DROP INDEX "ClientPayment_clientId_year_month_key";
CREATE UNIQUE INDEX "ClientPayment_clientId_year_month_kind_key" ON "ClientPayment"("clientId", "year", "month", "kind");

-- CreateTable: מילות מפתח לסיווג
CREATE TABLE "PaymentKeyword" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentKeyword_keyword_kind_key" ON "PaymentKeyword"("keyword", "kind");
