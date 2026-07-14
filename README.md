# CRM דו-צדדי למשרד דיגיטל

מערכת ניהול לקוחות ולידים דו-צדדית: **צד משרד** (ניהול כלל הלקוחות, משימות,
מסמכים, הודעות) ו**צד לקוח** (לידים, קמפיינים, פרויקטים, דוחות) — עברית, RTL,
ערכת עיצוב כהה.

- **אפיון ומקור אמת:** [SPEC.md](SPEC.md)
- **מדריך חיבורים (מה שנשאר לחבר):** [CONNECTIONS.md](CONNECTIONS.md)

## מחסנית

Next.js 14 (App Router) · Prisma · PostgreSQL בפרודקשן (Vercel/Neon) עם מראת
SQLite לפיתוח מקומי · Cloudflare R2 לקבצים (דיסק מקומי בפיתוח) · Tailwind +
Tremor · אימות עצמי (scrypt + HMAC cookie) + Google OAuth.

## ארכיטקטורה בקצרה

- **ליבה אחת + מודולים.** סוג הלקוח (`Client.type`: general / realestate / seo)
  קובע אילו מודולים ומסכים דולקים — `src/lib/modules.ts`.
- **סקופינג קשיח.** כל בקשת API עוברת דרך `scopeClientId` (`src/lib/api.ts`):
  לקוח לעולם רואה רק את עצמו; מנהל חייב לציין לקוח.
- **קליטה ישירה.** endpoint אחד (`/api/intake/[token]`) לכל המקורות —
  פייסבוק/אלמנטור/פייקול דרך Make/Zapier — עם דה-דופ ויומן קליטה.
- **הוקים עסקיים.** `src/lib/hooks.ts`: אוטומציית מלאי נדל"ן (עסקה ⟵ ירידה
  מהמלאי, ביטול ⟵ החזרה) + אוטומציות הודעות בהגדרת הלקוח.
- **שכבת הודעות אחת.** `src/lib/messaging.ts`: מייל/SMS/וואטסאפ; ערוץ לא-מחובר
  נרשם ביומן כ"ממתין לספק" במקום להיכשל.

## פיתוח מקומי

```bash
npm install
npm run db:dev     # יוצר סכמת SQLite מקומית + פרייסמה קליינט
npm run db:seed    # נתוני דמו (משתמשים: admin@agency.local / admin123 ועוד)
npm run dev
```

בדיקות עשן (נגד שרת רץ עם seed):

```bash
npm run test:smoke -- http://localhost:3000
```

## סקריפטים

| פקודה | תפקיד |
|---|---|
| `npm run db:dev` | סכמת dev (SQLite) + generate |
| `npm run db:migration:init` | חידוש מיגרציית ה-Postgres (עד עליית פרודקשן) |
| `npm run db:seed` | נתוני דמו מלאים |
| `npm run test:smoke` | בדיקות עשן לזרימות הקריטיות |
| `npm run import:legacy -- "שם לקוח"` | ייבוא לידים מהמערכת הישנה |
| `node scripts/receipts-uploader.mjs` | מעלה קבלות (רץ במחשב המשרד) |

## פריסה

Vercel: הסקריפט `vercel-build` מריץ `prisma migrate deploy` אוטומטית.
Cron jobs מוגדרים ב-`vercel.json` (תזכורות כל 5 דק׳, סנכרון SEO יומי).
הקמה ראשונית: `/setup` (יצירת מנהל ראשון; ננעל אחרי המשתמש הראשון).

ההוראות המלאות שלב-אחר-שלב: **[CONNECTIONS.md](CONNECTIONS.md)**.
