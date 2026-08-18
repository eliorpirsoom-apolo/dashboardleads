-- התראות הנהלת חשבונות: הגדרות (רשומה יחידה) + תזכורות ידניות.

CREATE TABLE "BillingAlertConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'billing',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "alertDay" INTEGER NOT NULL DEFAULT 15,
    "lastAlertMonth" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAlertConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingAlertConfig_key_key" ON "BillingAlertConfig"("key");

CREATE TABLE "BillingReminder" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "dueOn" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingReminder_dueOn_idx" ON "BillingReminder"("dueOn");
