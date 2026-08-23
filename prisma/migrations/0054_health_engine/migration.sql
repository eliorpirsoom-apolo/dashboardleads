-- מנוע בריאות: ריצות בדיקה, תקלות פתוחות, דופק קרונים.

CREATE TABLE "HealthRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" INTEGER NOT NULL DEFAULT 0,
    "warn" INTEGER NOT NULL DEFAULT 0,
    "fail" INTEGER NOT NULL DEFAULT 0,
    "results" TEXT,

    CONSTRAINT "HealthRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HealthRun_startedAt_idx" ON "HealthRun"("startedAt");

CREATE TABLE "HealthIssue" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'fail',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "HealthIssue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HealthIssue_key_key" ON "HealthIssue"("key");

CREATE INDEX "HealthIssue_resolvedAt_idx" ON "HealthIssue"("resolvedAt");

CREATE TABLE "CronHeartbeat" (
    "id" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "CronHeartbeat_pkey" PRIMARY KEY ("id")
);
