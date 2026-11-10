-- מצב "קלוט רק טפסים מנותבים" לחיבור Meta. אידמפוטנטי.
ALTER TABLE "MetaPage" ADD COLUMN IF NOT EXISTS "routedOnly" BOOLEAN NOT NULL DEFAULT false;
