-- מחיר בפועל בהצעת מחיר (נחתם ≠ הוצע) — מפוצל ריטיינר / חד-פעמי.
ALTER TABLE "Quote" ADD COLUMN "approvedRetainer" DOUBLE PRECISION;
ALTER TABLE "Quote" ADD COLUMN "approvedOneoff" DOUBLE PRECISION;
