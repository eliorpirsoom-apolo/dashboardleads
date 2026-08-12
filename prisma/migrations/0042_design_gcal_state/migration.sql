-- חיווי "תוזמן בלוז": מצב הסנכרון של משימת עיצוב מול יומן ה-Google של המעצב/ת.
ALTER TABLE "DesignTask" ADD COLUMN "gcalState" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "DesignTask" ADD COLUMN "gcalCheckedAt" TIMESTAMP(3);
ALTER TABLE "DesignTask" ADD COLUMN "gcalError" TEXT;
