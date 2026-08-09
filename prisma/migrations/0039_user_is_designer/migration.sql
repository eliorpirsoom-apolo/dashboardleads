-- AlterTable: סימון מעצב/ת בסטודיו (רק מסומנים מופיעים בלוח)
ALTER TABLE "User" ADD COLUMN     "isDesigner" BOOLEAN NOT NULL DEFAULT false;
