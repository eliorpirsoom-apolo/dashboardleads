-- מעבר לסכומים ללא מע"מ (18%): המרה חד-פעמית של כל מה שיובא מ-SUMIT ברוטו.
-- סכומים שהוקלדו ידנית (amount בלוח התשלומים, הצעות ידניות) לא נגעים.
UPDATE "SumitInvoice" SET "retainer" = "retainer" / 1.18, "oneoff" = "oneoff" / 1.18
  WHERE "retainer" > 0 OR "oneoff" > 0;
UPDATE "ClientPayment" SET "sumitAmount" = ROUND("sumitAmount" / 1.18)
  WHERE "sumitAmount" IS NOT NULL;
UPDATE "Quote" SET "amount" = ROUND("amount" / 1.18)
  WHERE "amount" IS NOT NULL AND "notes" LIKE '%[sumit:%';
