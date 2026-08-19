-- בורדים אישיים במודול המשימות: עדיפות + סדר ידני.

ALTER TABLE "Task" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "Task" ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 0;
