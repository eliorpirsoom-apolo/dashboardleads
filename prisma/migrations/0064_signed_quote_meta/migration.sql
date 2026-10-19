-- שדות מטא להצעת מחיר חתומה: נושא, סכום (לפני/כולל מע"מ), תאריך ההצעה. אידמפוטנטי.
ALTER TABLE "SignedQuote" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "SignedQuote" ADD COLUMN IF NOT EXISTS "amountPreVat" INTEGER;
ALTER TABLE "SignedQuote" ADD COLUMN IF NOT EXISTS "amountTotal" INTEGER;
ALTER TABLE "SignedQuote" ADD COLUMN IF NOT EXISTS "quoteDate" TIMESTAMP(3);
