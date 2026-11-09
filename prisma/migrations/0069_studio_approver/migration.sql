-- מקבל/ת התראת וואטסאפ לאישור תוצרי סטודיו (בקרת איכות).
ALTER TABLE "User" ADD COLUMN "isStudioApprover" BOOLEAN NOT NULL DEFAULT false;
