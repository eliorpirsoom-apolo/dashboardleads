-- ימי צילום שלב 2: בעלים של אירוע היומן (לעדכון/מחיקה ב-Google Calendar).
ALTER TABLE "ShootDay" ADD COLUMN IF NOT EXISTS "gcalOwnerId" TEXT;
