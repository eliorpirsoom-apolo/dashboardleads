-- הפרדת עלויות לקטגוריות: ספקי ה-CRM מול הוצאות המשרד הכלליות.

ALTER TABLE "SupplierCost" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'crm';
