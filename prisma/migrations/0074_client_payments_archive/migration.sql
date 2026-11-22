-- Payments-board archive flag for clients who ended their engagement.
-- NULL = active on the board; a timestamp = archived (moved to the collapsible
-- "archive" section at the bottom of the payments board, with full history kept).
-- Scoped to the payments board ONLY — it does NOT affect `active`/login/other modules.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "paymentsArchivedAt" TIMESTAMP(3);
