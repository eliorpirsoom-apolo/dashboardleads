-- עלויות ספקי צד-ג' (Vercel/Neon/OpenAI/Green API/SMS) — קבועות ודינמיות.

CREATE TABLE "SupplierCost" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "kind" TEXT NOT NULL DEFAULT 'fixed',
    "fixedAmount" DOUBLE PRECISION,
    "estimator" TEXT,
    "unitRate" DOUBLE PRECISION,
    "lastEstimate" DOUBLE PRECISION,
    "lastEstimatedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierCost_pkey" PRIMARY KEY ("id")
);
